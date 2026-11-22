/**
 * Orchestration test for the closed loop, using a throwaway local database and
 * a mocked worker transport. Synthetic Kane outcomes here exist ONLY in this
 * test to exercise ingestion/finalisation logic; the product never fabricates them.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const submitted: Array<{ jobId: string; tests: Array<{ testCaseId: string; objective: string }> }> = [];

vi.mock("@/lib/server/worker-client", () => ({
  WorkerError: class WorkerError extends Error {
    status?: number;
  },
  submitWorkerJob: vi.fn(async (job) => {
    submitted.push(job);
    return { jobId: job.jobId, status: "queued" };
  }),
  getWorkerJob: vi.fn(async () => {
    throw new Error("not used");
  }),
  // Stands in for the worker's artifact endpoint in this unit test.
  fetchWorkerArtifact: vi.fn(async () => FAKE_JPEG),
}));

const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 9, 9, 9]);

vi.mock("@/lib/server/site-probe", () => ({
  probeSite: vi.fn(async () => ({
    ok: true,
    finalUrl: "https://demo.example.com/",
    status: 200,
    title: "Demo",
    headings: ["h1: Demo"],
    links: [{ text: "Pricing", href: "https://demo.example.com/pricing" }],
    buttons: ["Start trial"],
    forms: [],
    error: null,
  })),
  describeProbe: () => "probe",
}));

type Svc = typeof import("@/lib/server/inspection-service");
let svc: Svc;

function outcome(testCaseId: string, objective: string, status: "PASSED" | "FAILED" | "ERROR") {
  return {
    testCaseId,
    objective,
    status,
    errorKind: status === "ERROR" ? ("auth" as const) : null,
    steps: [{ step: 1, status: status === "FAILED" ? "failed" : "done", remark: "r" }],
    stdout: `{"type":"run_end","status":"${status.toLowerCase()}"}`,
    stderr: "",
    exitCode: status === "PASSED" ? 0 : 1,
    durationMs: 1000,
    summary: status === "PASSED" ? "Objective met" : "Objective not met",
    reason: null,
    testUrl: null,
    evidenceReference: null,
    cliVersion: "0.10.7",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cech-test-"));
  process.env.CECH_LOCAL_DATA_FILE = path.join(dir, "db.json");
  process.env.CECH_ARTIFACT_DIR = path.join(dir, "artifacts");
  delete process.env.GROQ_API_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  svc = await import("@/lib/server/inspection-service");
});

describe("closed verification loop", () => {
  it("initial FAILED → retest PASSED → VERIFIED, with AI layer never changing Kane status", async () => {
    const insp = await svc.createInspection({ url: "https://demo.example.com/", categories: ["navigation", "interface"], instructions: null });
    await svc.planAndDispatch(insp.id);

    let report = (await svc.getReport(insp.id))!;
    expect(report.inspection.status).toBe("running");
    expect(report.inspection.plan_source).toBe("baseline"); // no GROQ_API_KEY in tests
    const job1 = submitted.at(-1)!;
    expect(job1.tests.length).toBe(report.tests.length);

    // Kane reports: first test fails, the rest pass.
    for (const [i, t] of job1.tests.entries()) {
      await svc.handleWorkerEvent({ type: "test_completed", jobId: job1.jobId, test: outcome(t.testCaseId, t.objective, i === 0 ? "FAILED" : "PASSED") });
    }
    report = (await svc.getReport(insp.id))!;
    expect(report.inspection.status).toBe("completed");
    expect(report.inspection.overall_status).toBe("issues_found");
    const first = report.tests.find((t) => t.id === job1.tests[0].testCaseId)!;
    expect(first.results[0].execution_status).toBe("FAILED");
    expect(first.results[0].analysis?.source).toBe("unavailable"); // AI unavailable → stored separately, status untouched

    // A late duplicate/downgrading event must not overwrite a verdict.
    await svc.handleWorkerEvent({ type: "test_progress", jobId: job1.jobId, test: { ...outcome(job1.tests[0].testCaseId, "x", "PASSED"), status: "RUNNING" as never } });
    expect((await svc.getReport(insp.id))!.tests.find((t) => t.id === first.id)!.results[0].execution_status).toBe("FAILED");

    // Retest only the failed test.
    const run2 = await svc.createRetest(insp.id, "failed");
    expect(run2.test_case_ids).toEqual([first.id]);
    expect(run2.parent_run_id).toBe(report.runs[0].id);
    await svc.planAndDispatchRetest(run2.id);
    const job2 = submitted.at(-1)!;
    expect(job2.jobId).toBe(run2.id);
    await svc.handleWorkerEvent({ type: "test_completed", jobId: job2.jobId, test: outcome(first.id, job2.tests[0].objective, "PASSED") });

    report = (await svc.getReport(insp.id))!;
    expect(report.runs).toHaveLength(2);
    expect(report.inspection.overall_status).toBe("verified");
    expect(report.inspection.health_score).toBe(100);
    expect(report.tests.find((t) => t.id === first.id)!.results.map((r) => r.execution_status)).toEqual(["FAILED", "PASSED"]);
  });

  it("infrastructure errors produce ERROR + system analysis and no health score", async () => {
    const insp = await svc.createInspection({ url: "https://demo.example.com/", categories: ["interface"], instructions: null });
    await svc.planAndDispatch(insp.id);
    const job = submitted.at(-1)!;
    for (const t of job.tests) {
      await svc.handleWorkerEvent({ type: "test_completed", jobId: job.jobId, test: outcome(t.testCaseId, t.objective, "ERROR") });
    }
    const report = (await svc.getReport(insp.id))!;
    expect(report.inspection.overall_status).toBe("incomplete");
    expect(report.inspection.health_score).toBeNull();
    expect(report.tests[0].results[0].analysis?.source).toBe("system");
  });

  it("rejects retest while a run is in progress", async () => {
    const insp = await svc.createInspection({ url: "https://demo.example.com/", categories: ["interface"], instructions: null });
    await svc.planAndDispatch(insp.id);
    await expect(svc.createRetest(insp.id, "all")).rejects.toThrow(/Wait for the current run/);
  });
});

describe("Proof of Fix through the orchestration path", () => {
  const sha = (b: Uint8Array) => require("node:crypto").createHash("sha256").update(b).digest("hex") as string;
  const withEvidence = (o: ReturnType<typeof outcome>, kinds: string[]) => ({
    ...o,
    evidence: {
      mode: "cdp",
      viewport: { width: 1920, height: 937, deviceScaleFactor: 1 },
      url_before: "https://demo.example.com/",
      url_after: o.status === "FAILED" ? "https://demo.example.com/about" : "https://demo.example.com/pricing",
      console_errors: [],
      failed_requests: [],
      capture_errors: [],
      started_at: o.startedAt,
      completed_at: o.completedAt,
      artifacts: kinds.map((kind) => ({ kind, content_type: "image/jpeg", bytes: FAKE_JPEG.length, width: 1920, height: 937, sha256: sha(FAKE_JPEG), page_url: "https://demo.example.com/", captured_at: o.completedAt })),
      kane_evidence_pack: null,
    },
  });

  it("stores evidence, records a verified fix, marks regression, and builds proof reports", async () => {
    const { getRepository } = await import("@/lib/store");
    const { buildProof, proofToJson, proofToMarkdown, proofToPdf } = await import("@/lib/server/proof-report");
    const insp = await svc.createInspection({ url: "https://demo.example.com/", categories: ["navigation"], instructions: null });
    await svc.planAndDispatch(insp.id);
    const job1 = submitted.at(-1)!;
    const target = job1.tests[0];
    for (const t of job1.tests) {
      const failing = t.testCaseId === target.testCaseId;
      await svc.handleWorkerEvent({ type: "test_completed", jobId: job1.jobId, test: withEvidence(outcome(t.testCaseId, t.objective, failing ? "FAILED" : "PASSED"), failing ? ["before", "at_failure", "after_viewport"] : ["before"]) });
    }
    let report = (await svc.getReport(insp.id))!;
    const first = report.tests.find((t) => t.id === target.testCaseId)!.results[0];
    expect(first.evidence?.url_after).toBe("https://demo.example.com/about");
    expect(first.artifacts.map((a) => a.kind).sort()).toEqual(["after_viewport", "at_failure", "before"]);
    expect(first.expected_outcome).toBeTruthy();
    expect(report.verifications).toHaveLength(0);

    // Exact replay re-runs the identical original objective.
    const run2 = await svc.createRetest(insp.id, "failed");
    await svc.planAndDispatchRetest(run2.id, "exact");
    const job2 = submitted.at(-1)!;
    expect(job2.tests[0].objective).toBe(target.objective);
    await svc.handleWorkerEvent({ type: "test_completed", jobId: job2.jobId, test: withEvidence(outcome(target.testCaseId, job2.tests[0].objective, "PASSED"), ["before", "after_viewport"]) });

    report = (await svc.getReport(insp.id))!;
    expect(report.verifications).toHaveLength(1);
    expect(report.verifications[0]).toMatchObject({ test_case_id: target.testCaseId, status: "verified", equivalence: "exact_objective" });
    expect(report.inspection.overall_status).toBe("verified");

    const proof = buildProof(report, target.testCaseId)!;
    expect(proof.status).toBe("verified");
    expect(proofToJson(proof).status).toBe("PROOF OF FIX — VERIFIED");
    expect(proofToMarkdown(proof)).toContain("# CECH — PROOF OF FIX REPORT");
    const pdf = await proofToPdf(proof);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");

    // The same test genuinely failing again → the record is kept and marked regressed.
    const run3 = await svc.createRetest(insp.id, "all");
    await svc.planAndDispatchRetest(run3.id, "exact");
    const job3 = submitted.at(-1)!;
    for (const t of job3.tests) {
      await svc.handleWorkerEvent({ type: "test_completed", jobId: job3.jobId, test: outcome(t.testCaseId, t.objective, t.testCaseId === target.testCaseId ? "FAILED" : "PASSED") });
    }
    const records = await getRepository().listFixVerifications(insp.id);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("regressed");
    report = (await svc.getReport(insp.id))!;
    expect(report.inspection.overall_status).toBe("issues_found");
    expect(buildProof(report, target.testCaseId)?.status).toBe("regressed");
  });

  it("a retest with a changed expected outcome is not a verified fix", async () => {
    const { getRepository } = await import("@/lib/store");
    const insp = await svc.createInspection({ url: "https://demo.example.com/", categories: ["interface"], instructions: null });
    await svc.planAndDispatch(insp.id);
    const job = submitted.at(-1)!;
    for (const t of job.tests) await svc.handleWorkerEvent({ type: "test_completed", jobId: job.jobId, test: outcome(t.testCaseId, t.objective, "FAILED") });
    const run2 = await svc.createRetest(insp.id, "failed");
    // Simulate a tampered/changed expected outcome on the test definition before the retest.
    for (const id of run2.test_case_ids) await getRepository().updateTestCase(id, { expected_outcome: "Something easier" });
    await svc.planAndDispatchRetest(run2.id, "exact");
    const job2 = submitted.at(-1)!;
    for (const t of job2.tests) await svc.handleWorkerEvent({ type: "test_completed", jobId: job2.jobId, test: outcome(t.testCaseId, t.objective, "PASSED") });
    const report = (await svc.getReport(insp.id))!;
    expect(report.verifications).toHaveLength(0);
    expect(report.inspection.overall_status).not.toBe("verified");
  });
});
