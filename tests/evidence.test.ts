import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sanitizeEvidence } from "@/lib/evidence-schema";
import type { ExecutionEvidence } from "@/lib/types";

// Minimal valid JPEG/PNG byte signatures (content after the header is irrelevant to sniffing).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

let dir: string;
type Mods = {
  store: typeof import("@/lib/server/artifact-store");
  ev: typeof import("@/lib/server/evidence-service");
  access: typeof import("@/lib/server/evidence-access");
  repo: typeof import("@/lib/store");
};
let m: Mods;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "cech-evidence-test-"));
  process.env.CECH_LOCAL_DATA_FILE = path.join(dir, "db.json");
  process.env.CECH_ARTIFACT_DIR = path.join(dir, "artifacts");
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  m = {
    store: await import("@/lib/server/artifact-store"),
    ev: await import("@/lib/server/evidence-service"),
    access: await import("@/lib/server/evidence-access"),
    repo: await import("@/lib/store"),
  };
});

const sha = async (b: Uint8Array) => (await import("node:crypto")).createHash("sha256").update(b).digest("hex");

function evidence(over: Partial<ExecutionEvidence> = {}): ExecutionEvidence {
  return {
    mode: "cdp",
    viewport: { width: 1920, height: 937, deviceScaleFactor: 1 },
    url_before: "https://demo.example.com/",
    url_after: "https://demo.example.com/about",
    console_errors: [{ text: "TypeError: x is undefined", url: null, at: "2026-11-22T10:00:00Z" }],
    failed_requests: [{ url: "https://demo.example.com/api/x", method: "POST", status: 404, error: null, at: "2026-11-22T10:00:01Z" }],
    capture_errors: [],
    started_at: "2026-11-22T10:00:00Z",
    completed_at: "2026-11-22T10:00:30Z",
    artifacts: [],
    kane_evidence_pack: null,
    ...over,
  };
}

/** Create a real inspection → test → run → result chain in the throwaway database. */
async function seed() {
  const repo = m.repo.getRepository();
  const insp = await repo.createInspection({
    user_id: null,
    website_url: "https://demo.example.com/",
    status: "running",
    overall_status: "pending",
    selected_categories: ["navigation"],
    custom_instructions: null,
    health_score: null,
    plan_source: "baseline",
    plan_notes: null,
    summary: null,
    error: null,
    latest_run_id: null,
    completed_at: null,
  });
  const [tc] = await repo.createTestCases([
    { inspection_id: insp.id, key: "navigation-001", category: "navigation", title: "Pricing nav", objective: "Go to https://demo.example.com/ and click Pricing. Verify that the pricing page loads.", expected_outcome: "Pricing loads", priority: "high", assumption: null, status: "FAILED", position: 0 },
  ]);
  const run = await repo.createRun({ inspection_id: insp.id, parent_run_id: null, sequence: 1, run_type: "initial", status: "running", test_case_ids: [tc.id], health_score: null, passed: 0, failed: 0, inconclusive: 0, errored: 0, error: null, started_at: null, completed_at: null });
  const result = await repo.upsertResult({
    test_case_id: tc.id, verification_run_id: run.id, objective: tc.objective, objective_note: null, expected_outcome: tc.expected_outcome, evidence: null,
    execution_status: "FAILED", error_kind: null, raw_output: null, stderr: null, exit_code: 1, duration_ms: 1000, evidence_reference: null,
    kane_summary: "Pricing link went to /about", kane_reason: null, kane_test_url: null, steps: [], started_at: null, completed_at: null,
  });
  return { insp, tc, run, result };
}

describe("evidence metadata validation", () => {
  it("accepts valid worker evidence", () => {
    const e = sanitizeEvidence(evidence());
    expect(e?.mode).toBe("cdp");
    expect(e?.console_errors).toHaveLength(1);
  });
  it("discards invalid metadata with a recorded reason (never guesses)", () => {
    const e = sanitizeEvidence({ mode: "cdp", artifacts: [{ kind: "evil", bytes: -1 }] });
    expect(e?.mode).toBe("none");
    expect(e?.artifacts).toHaveLength(0);
    expect(e?.capture_errors[0]).toMatch(/failed validation/);
  });
  it("rejects unknown artifact kinds and oversized artifacts", () => {
    const bad = evidence({ artifacts: [{ kind: "before", content_type: "image/jpeg", bytes: 10 * 1024 * 1024, width: 1, height: 1, sha256: "a".repeat(64), page_url: null, captured_at: "x" }] });
    expect(sanitizeEvidence(bad)?.mode).toBe("none");
  });
  it("keeps one artifact per kind", () => {
    const a = { kind: "before" as const, content_type: "image/jpeg" as const, bytes: 10, width: 1, height: 1, sha256: "a".repeat(64), page_url: null, captured_at: "x" };
    expect(sanitizeEvidence(evidence({ artifacts: [a, a] }))?.artifacts).toHaveLength(1);
  });
  it("returns null when no evidence was sent (legacy worker)", () => {
    expect(sanitizeEvidence(undefined)).toBeNull();
  });
});

describe("artifact file validation", () => {
  const key = "00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/before.jpg";
  it("sniffs real image types from bytes", () => {
    expect(m.store.sniffImageType(JPEG)).toBe("image/jpeg");
    expect(m.store.sniffImageType(PNG)).toBe("image/png");
    expect(m.store.sniffImageType(HTML)).toBeNull();
  });
  it("rejects non-images, empty, oversized, traversal keys, extension mismatch and checksum mismatch", async () => {
    expect(() => m.store.validateArtifact(HTML, key)).toThrow(/not a JPEG or PNG/);
    expect(() => m.store.validateArtifact(new Uint8Array(), key)).toThrow(/Empty/);
    const big = new Uint8Array(m.store.MAX_ARTIFACT_BYTES + 1);
    big.set(JPEG);
    expect(() => m.store.validateArtifact(big, key)).toThrow(/exceeds/);
    expect(() => m.store.validateArtifact(JPEG, "../../etc/passwd.jpg")).toThrow(/Invalid artifact key/);
    expect(() => m.store.validateArtifact(PNG, key)).toThrow(/extension/);
    expect(() => m.store.validateArtifact(JPEG, key, "0".repeat(64))).toThrow(/checksum/);
    expect(m.store.validateArtifact(JPEG, key, await sha(JPEG)).contentType).toBe("image/jpeg");
  });
});

describe("evidence storage", () => {
  it("stores screenshots privately and associates them with the right inspection, test, result and run", async () => {
    const { insp, tc, run, result } = await seed();
    const meta = { kind: "at_failure" as const, content_type: "image/jpeg" as const, bytes: JPEG.length, width: 1920, height: 937, sha256: await sha(JPEG), page_url: "https://demo.example.com/about", captured_at: "2026-11-22T10:00:10Z" };
    const fetched: string[] = [];
    const out = await m.ev.storeEvidenceArtifacts({
      inspectionId: insp.id, run, result, evidence: evidence({ artifacts: [meta] }),
      fetcher: async (jobId, testCaseId, kind) => {
        fetched.push(`${jobId}/${testCaseId}/${kind}`);
        return JPEG;
      },
    });
    expect(out.capture_errors).toEqual([]);
    expect(fetched).toEqual([`${run.id}/${tc.id}/at_failure`]);
    const [a] = await m.repo.getRepository().listArtifactsForInspection(insp.id);
    expect(a).toMatchObject({ inspection_id: insp.id, test_case_id: tc.id, test_result_id: result.id, verification_run_id: run.id, kind: "at_failure", content_type: "image/jpeg" });
    expect(a.storage_key).toBe(`${insp.id}/${result.id}/at_failure.jpg`);
    // Persistent retrieval through the authorised access path.
    const got = await m.access.loadEvidence(insp.id, a.id);
    expect(got.ok && Buffer.from(got.bytes).equals(Buffer.from(JPEG))).toBe(true);
  });

  it("records a capture error (never changes the Kane result) when transfer fails, leaving no orphan", async () => {
    const { insp, run, result } = await seed();
    const meta = { kind: "before" as const, content_type: "image/jpeg" as const, bytes: 14, width: 1, height: 1, sha256: await sha(JPEG), page_url: null, captured_at: "x" };
    const out = await m.ev.storeEvidenceArtifacts({ inspectionId: insp.id, run, result, evidence: evidence({ artifacts: [meta] }), fetcher: async () => HTML });
    expect(out.capture_errors.join(" ")).toMatch(/before screenshot could not be stored: Artifact is not a JPEG or PNG/);
    expect(await m.repo.getRepository().listArtifactsForInspection(insp.id)).toHaveLength(0);
    const resultDir = path.join(dir, "artifacts", insp.id, result.id);
    expect(existsSync(resultDir) ? readdirSync(resultDir) : []).toHaveLength(0);
    const stored = (await m.repo.getRepository().listResultsForRun(run.id))[0];
    expect(stored.execution_status).toBe("FAILED");
  });

  it("recovers from a worker outage during transfer", async () => {
    const { insp, run, result } = await seed();
    const meta = { kind: "after_viewport" as const, content_type: "image/jpeg" as const, bytes: 14, width: 1, height: 1, sha256: await sha(JPEG), page_url: null, captured_at: "x" };
    const out = await m.ev.storeEvidenceArtifacts({ inspectionId: insp.id, run, result, evidence: evidence({ artifacts: [meta] }), fetcher: async () => { throw new Error("Worker unreachable"); } });
    expect(out.capture_errors[0]).toMatch(/after_viewport screenshot could not be stored: Worker unreachable/);
  });
});

describe("deployments without the Proof of Fix migration", () => {
  it("degrades honestly: nothing stored, reason recorded, Kane result untouched", async () => {
    const { insp, run, result } = await seed();
    const repo = m.repo.getRepository();
    const spy = vi.spyOn(repo, "evidenceSupported").mockResolvedValue(false);
    const fetcher = vi.fn(async () => JPEG);
    const meta = { kind: "before" as const, content_type: "image/jpeg" as const, bytes: 14, width: 1, height: 1, sha256: await sha(JPEG), page_url: null, captured_at: "x" };
    const out = await m.ev.storeEvidenceArtifacts({ inspectionId: insp.id, run, result, evidence: evidence({ artifacts: [meta] }), fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(out.capture_errors.join(" ")).toMatch(/migration has not been applied/);
    expect((await m.access.loadEvidence(insp.id, "00000000-0000-0000-0000-000000000000")).ok).toBe(false);
    spy.mockRestore();
  });
});

describe("evidence access control", () => {
  it("rejects access through another inspection (no cross-inspection / cross-user access)", async () => {
    const a = await seed();
    const b = await seed();
    const meta = { kind: "before" as const, content_type: "image/jpeg" as const, bytes: 14, width: 1, height: 1, sha256: await sha(JPEG), page_url: null, captured_at: "x" };
    await m.ev.storeEvidenceArtifacts({ inspectionId: a.insp.id, run: a.run, result: a.result, evidence: evidence({ artifacts: [meta] }), fetcher: async () => JPEG });
    const [art] = await m.repo.getRepository().listArtifactsForInspection(a.insp.id);
    expect((await m.access.loadEvidence(a.insp.id, art.id)).ok).toBe(true);
    const cross = await m.access.loadEvidence(b.insp.id, art.id);
    expect(cross).toEqual({ ok: false, status: 404, error: "Evidence not found." });
  });
  it("rejects malformed and unknown ids (no path injection)", async () => {
    expect((await m.access.loadEvidence("../../etc", "passwd")).ok).toBe(false);
    expect((await m.access.loadEvidence("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000")).ok).toBe(false);
  });
});
