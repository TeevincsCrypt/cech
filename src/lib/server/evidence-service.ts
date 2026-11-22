import "server-only";
import { evaluateIssue } from "@/lib/proof-of-fix";
import { getArtifactStore, MAX_ARTIFACT_BYTES, validateArtifact } from "@/lib/server/artifact-store";
import { fetchWorkerArtifact } from "@/lib/server/worker-client";
import { getRepository } from "@/lib/store";
import type { ExecutionEvidence, TestCase, TestResult, VerificationRun } from "@/lib/types";

const log = (evt: string, data: Record<string, unknown>) => console.info(JSON.stringify({ evt, ...data }));

/**
 * Pull each captured screenshot from the worker, validate it (type, size,
 * checksum against the worker's own record), store it privately and record it.
 * Returns the evidence with any transfer problems appended to capture_errors.
 * Never changes the Kane outcome.
 */
export async function storeEvidenceArtifacts(params: {
  inspectionId: string;
  run: VerificationRun;
  result: TestResult;
  evidence: ExecutionEvidence;
  fetcher?: typeof fetchWorkerArtifact;
}): Promise<ExecutionEvidence> {
  const { inspectionId, run, result } = params;
  const evidence: ExecutionEvidence = { ...params.evidence, capture_errors: [...params.evidence.capture_errors] };
  const repo = getRepository();
  if (evidence.artifacts.length === 0) return evidence;
  if (!(await repo.evidenceSupported())) {
    evidence.capture_errors.push("Screenshots were captured but could not be stored: the Proof of Fix database migration has not been applied.");
    return evidence;
  }
  const store = getArtifactStore();
  const fetcher = params.fetcher ?? fetchWorkerArtifact;

  for (const meta of evidence.artifacts) {
    const key = `${inspectionId}/${result.id}/${meta.kind}.${meta.content_type === "image/png" ? "png" : "jpg"}`;
    let stored = false;
    try {
      const bytes = await fetcher(run.id, result.test_case_id, meta.kind, MAX_ARTIFACT_BYTES);
      const { contentType, sha256 } = validateArtifact(bytes, key, meta.sha256);
      await store.put(key, bytes, contentType);
      stored = true;
      await repo.upsertArtifact({
        inspection_id: inspectionId,
        test_case_id: result.test_case_id,
        test_result_id: result.id,
        verification_run_id: run.id,
        kind: meta.kind,
        storage_key: key,
        content_type: contentType,
        bytes: bytes.length,
        width: meta.width,
        height: meta.height,
        sha256,
        page_url: meta.page_url,
        captured_at: meta.captured_at,
      });
    } catch (err) {
      evidence.capture_errors.push(`${meta.kind} screenshot could not be stored: ${(err as Error).message}`);
      // Don't leave an orphaned object if the database record failed.
      if (stored) await store.remove(key).catch(() => {});
    }
  }
  log("evidence_stored", { resultId: result.id, artifacts: evidence.artifacts.length, errors: evidence.capture_errors.length });
  return evidence;
}

/**
 * Persist Proof of Fix records for an inspection from real Kane outcomes.
 * Verified pairs are upserted; previously verified pairs whose test has since
 * genuinely failed again are marked regressed (the record is kept).
 */
export async function recordFixVerifications(inspectionId: string, cases: TestCase[], results: TestResult[], runs: VerificationRun[]) {
  const repo = getRepository();
  if (!(await repo.evidenceSupported())) return;
  const seq = new Map(runs.map((r) => [r.id, r.sequence]));
  const existing = await repo.listFixVerifications(inspectionId);
  for (const c of cases) {
    const ordered = results
      .filter((r) => r.test_case_id === c.id)
      .sort((a, b) => (seq.get(a.verification_run_id) ?? 0) - (seq.get(b.verification_run_id) ?? 0));
    const ev = evaluateIssue(c, ordered);
    if (ev.state === "verified" && ev.proof) {
      const prior = existing.find((x) => x.original_result_id === ev.proof!.original.id && x.retest_result_id === ev.proof!.retest.id);
      await repo.upsertFixVerification({
        inspection_id: inspectionId,
        test_case_id: c.id,
        original_result_id: ev.proof.original.id,
        retest_result_id: ev.proof.retest.id,
        equivalence: ev.proof.equivalence,
        status: "verified",
        regressed_result_id: null,
        verified_at: prior?.verified_at ?? new Date().toISOString(),
        regressed_at: null,
      });
    } else if (ev.state === "regressed" && ev.regressedBy) {
      for (const v of existing.filter((x) => x.test_case_id === c.id && x.status === "verified")) {
        await repo.upsertFixVerification({ ...v, status: "regressed", regressed_result_id: ev.regressedBy.id, regressed_at: new Date().toISOString() });
      }
    }
  }
}
