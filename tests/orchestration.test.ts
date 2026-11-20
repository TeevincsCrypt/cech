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
}));

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
