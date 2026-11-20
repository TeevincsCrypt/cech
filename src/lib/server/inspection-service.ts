import "server-only";
import {
  analyzeTestResult,
  generateInspectionSummary,
  generateRetestPlan,
  generateTestPlan,
  systemAnalysisForError,
} from "@/lib/groq/service";
import { computeHealthScore, computeOverallStatus } from "@/lib/scoring";
import { probeSite } from "@/lib/server/site-probe";
import { getWorkerJob, submitWorkerJob, WorkerError, type WorkerTestOutcome } from "@/lib/server/worker-client";
import { getRepository } from "@/lib/store";
import type { NewResult } from "@/lib/store/types";
import {
  isTerminal,
  type AiAnalysis,
  type Inspection,
  type InspectionReport,
  type RunType,
  type TestCase,
  type TestCategory,
  type TestResult,
  type VerificationRun,
} from "@/lib/types";

const repo = () => getRepository();
const now = () => new Date().toISOString();

function log(evt: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ evt, ...data }));
}

// ------------------------------------------------------------------ create
export async function createInspection(input: {
  url: string;
  categories: TestCategory[];
  instructions: string | null;
}): Promise<Inspection> {
  return repo().createInspection({
    user_id: null,
    website_url: input.url,
    status: "planning",
    overall_status: "pending",
    selected_categories: input.categories,
    custom_instructions: input.instructions,
    health_score: null,
    plan_source: null,
    plan_notes: null,
    summary: null,
    error: null,
    latest_run_id: null,
    completed_at: null,
  });
}

/** Background step: Groq plans objectives, then the run is dispatched to Kane. */
export async function planAndDispatch(inspectionId: string): Promise<void> {
  const r = repo();
  const inspection = await r.getInspection(inspectionId);
  if (!inspection) return;
  try {
    const probe = await probeSite(inspection.website_url);
    log("site_probe", { inspectionId, ok: probe.ok, links: probe.links.length, forms: probe.forms.length, error: probe.error });

    const plan = await generateTestPlan({
      url: inspection.website_url,
      categories: inspection.selected_categories,
      instructions: inspection.custom_instructions,
      probe,
    });
    log("plan_generated", { inspectionId, source: plan.source, tests: plan.tests.length, model: plan.model });

    const cases = await r.createTestCases(
      plan.tests.map((t, i) => ({
        inspection_id: inspectionId,
        key: t.key,
        category: t.category,
        title: t.title,
        objective: t.objective,
        expected_outcome: t.expected_outcome,
        priority: t.priority,
        assumption: t.assumption || null,
        status: "NOT_EXECUTED",
        position: i,
      })),
    );

    const run = await r.createRun({
      inspection_id: inspectionId,
      parent_run_id: null,
      sequence: 1,
      run_type: "initial",
      status: "dispatching",
      test_case_ids: cases.map((c) => c.id),
      health_score: null,
      passed: 0,
      failed: 0,
      inconclusive: 0,
      errored: 0,
      error: null,
      started_at: now(),
      completed_at: null,
    });

    const notes = [plan.notes, probe.ok ? null : `Homepage probe: ${probe.error}`].filter(Boolean).join(" ");
    await r.updateInspection(inspectionId, {
      status: "dispatching",
      plan_source: plan.source,
      plan_notes: notes || null,
      latest_run_id: run.id,
    });

    await dispatchRun(inspection, run, cases.map((c) => ({ test: c, objective: c.objective, note: null })));
  } catch (err) {
    console.error("[inspection] planning failed", err);
    await r.updateInspection(inspectionId, { status: "failed", error: `Planning failed: ${(err as Error).message}` });
  }
}

// ------------------------------------------------------------------ dispatch
async function dispatchRun(
  inspection: Inspection,
  run: VerificationRun,
  items: Array<{ test: TestCase; objective: string; note: string | null }>,
): Promise<void> {
  const r = repo();
  // Pre-create QUEUED rows so progress is visible immediately.
  for (const item of items) {
    await r.upsertResult(blankResult(run.id, item.test.id, item.objective, item.note));
    await r.updateTestCase(item.test.id, { status: "QUEUED" });
  }

  try {
    await submitWorkerJob({
      jobId: run.id,
      url: inspection.website_url,
      tests: items.map((i) => ({ testCaseId: i.test.id, objective: i.objective })),
    });
    await r.updateRun(run.id, { status: "running" });
    await r.updateInspection(inspection.id, { status: "running" });
    log("run_dispatched", { runId: run.id, tests: items.length });
  } catch (err) {
    // The worker never ran these tests: record an infrastructure ERROR, not a website failure.
    const message = err instanceof WorkerError ? err.message : `Dispatch failed: ${(err as Error).message}`;
    log("run_dispatch_failed", { runId: run.id, message });
    await r.updateRun(run.id, { status: "running", error: message });
    for (const item of items) {
      await ingestOutcome(run, {
        testCaseId: item.test.id,
        objective: item.objective,
        status: "ERROR",
        errorKind: err instanceof WorkerError && err.status === 422 ? "url_rejected" : "worker",
        steps: [],
        stdout: null,
        stderr: message,
        exitCode: null,
        durationMs: 0,
        summary: null,
        reason: message,
        testUrl: null,
        evidenceReference: null,
        cliVersion: null,
        startedAt: null,
        completedAt: now(),
      });
    }
  }
}

function blankResult(runId: string, testCaseId: string, objective: string, note: string | null): NewResult {
  return {
    test_case_id: testCaseId,
    verification_run_id: runId,
    objective,
    objective_note: note,
    execution_status: "QUEUED",
    error_kind: null,
    raw_output: null,
    stderr: null,
    exit_code: null,
    duration_ms: null,
    evidence_reference: null,
    kane_summary: null,
    kane_reason: null,
    kane_test_url: null,
    steps: [],
    started_at: null,
    completed_at: null,
  };
}

// ------------------------------------------------------------------ worker events
export async function handleWorkerEvent(event: {
  type: string;
  jobId: string;
  test: WorkerTestOutcome | null;
}): Promise<{ ok: boolean; error?: string }> {
  const r = repo();
  const run = await r.getRun(event.jobId);
  if (!run) return { ok: false, error: "Unknown job" };

  if (event.type === "job_completed") {
    await maybeFinalizeRun(run.id);
    return { ok: true };
  }
  const t = event.test;
  if (!t || !run.test_case_ids.includes(t.testCaseId)) return { ok: false, error: "Unknown test" };

  const existing = (await r.listResultsForRun(run.id)).find((x) => x.test_case_id === t.testCaseId);
  if (existing && isTerminal(existing.execution_status)) return { ok: true }; // never downgrade a verdict

  if (event.type === "test_started" || event.type === "test_progress") {
    await r.upsertResult({
      ...blankResult(run.id, t.testCaseId, existing?.objective ?? t.objective, existing?.objective_note ?? null),
      execution_status: "RUNNING",
      steps: t.steps ?? [],
      started_at: t.startedAt,
    });
    await r.updateTestCase(t.testCaseId, { status: "RUNNING" });
    return { ok: true };
  }
  if (event.type === "test_completed") {
    if (!isTerminal(t.status)) return { ok: false, error: "Non-terminal status in test_completed" };
    await ingestOutcome(run, t);
    return { ok: true };
  }
  return { ok: false, error: `Unknown event type ${event.type}` };
}

/** Store a real Kane outcome, run AI analysis on it, then try to finalise the run. */
async function ingestOutcome(run: VerificationRun, t: WorkerTestOutcome): Promise<void> {
  const r = repo();
  const existing = (await r.listResultsForRun(run.id)).find((x) => x.test_case_id === t.testCaseId);
  const result = await r.upsertResult({
    test_case_id: t.testCaseId,
    verification_run_id: run.id,
    objective: existing?.objective ?? t.objective,
    objective_note: existing?.objective_note ?? null,
    execution_status: t.status,
    error_kind: t.errorKind,
    raw_output: t.stdout,
    stderr: t.stderr,
    exit_code: t.exitCode,
    duration_ms: t.durationMs,
    evidence_reference: t.evidenceReference,
    kane_summary: t.summary,
    kane_reason: t.reason,
    kane_test_url: t.testUrl,
    steps: t.steps ?? [],
    started_at: t.startedAt,
    completed_at: t.completedAt ?? now(),
  });
  await r.updateTestCase(t.testCaseId, { status: t.status });
  log("result_ingested", { runId: run.id, testCaseId: t.testCaseId, status: t.status, errorKind: t.errorKind });

  await analyzeAndStore(run, result);
  await maybeFinalizeRun(run.id);
}

async function analyzeAndStore(run: VerificationRun, result: TestResult): Promise<void> {
  const r = repo();
  const inspection = await r.getInspection(run.inspection_id);
  const test = (await r.listTestCases(run.inspection_id)).find((c) => c.id === result.test_case_id);
  if (!inspection || !test) return;
  let analysis;
  try {
    analysis = await analyzeTestResult({ url: inspection.website_url, test, result });
  } catch (err) {
    console.error("[analysis] failed", err);
    analysis =
      result.execution_status === "ERROR"
        ? systemAnalysisForError(result)
        : {
            source: "unavailable" as const,
            summary: `AI analysis failed: ${(err as Error).message}`,
            issue_detected: null,
            severity: null,
            title: null,
            description: null,
            expected_behavior: test.expected_outcome,
            observed_behavior: result.kane_summary,
            recommendation: null,
            confidence: null,
            model: null,
          };
  }
  await r.upsertAnalysis({ ...analysis, test_result_id: result.id });
}

// ------------------------------------------------------------------ finalise
export async function maybeFinalizeRun(runId: string): Promise<void> {
  const r = repo();
  const run = await r.getRun(runId);
  if (!run || run.status === "completed" || run.status === "analyzing") return;
  const results = await r.listResultsForRun(runId);
  if (results.length < run.test_case_ids.length || !results.every((x) => isTerminal(x.execution_status))) return;
  const analyses = await r.listAnalyses(results.map((x) => x.id));
  if (analyses.length < results.length) return;

  // Atomic claim so only one concurrent callback finalises.
  const claimed = await r.transitionRun(runId, ["running", "dispatching"], { status: "analyzing" });
  if (!claimed) return;
  try {
    await finalize(run, results);
  } catch (err) {
    console.error("[finalize] failed", err);
    await r.updateRun(runId, { status: "completed", completed_at: now(), error: `Finalisation error: ${(err as Error).message}` });
    await r.updateInspection(run.inspection_id, { status: "completed", completed_at: now() });
  }
}

async function finalize(run: VerificationRun, runResults: TestResult[]) {
  const r = repo();
  await r.updateInspection(run.inspection_id, { status: "analyzing" });
  const inspection = (await r.getInspection(run.inspection_id))!;
  const cases = await r.listTestCases(run.inspection_id);
  const byId = new Map(cases.map((c) => [c.id, c]));

  // Per-run statistics (only the tests executed in this run).
  const count = (s: string) => runResults.filter((x) => x.execution_status === s).length;
  const runScore = computeHealthScore(
    runResults.map((x) => ({ priority: byId.get(x.test_case_id)?.priority ?? "medium", status: x.execution_status })),
  );

  // Inspection-level view: the latest real Kane outcome for every test.
  const runs = await r.listRuns(run.inspection_id);
  const seq = new Map(runs.map((x) => [x.id, x.sequence]));
  const allResults = await r.listResultsForCases(cases.map((c) => c.id));
  const latest = new Map<string, TestResult>();
  for (const res of allResults) {
    const cur = latest.get(res.test_case_id);
    if (!cur || (seq.get(res.verification_run_id) ?? 0) > (seq.get(cur.verification_run_id) ?? 0)) latest.set(res.test_case_id, res);
  }
  const analyses = await r.listAnalyses([...latest.values()].map((x) => x.id));
  const analysisFor = new Map(analyses.map((a) => [a.test_result_id, a]));

  const score = computeHealthScore(cases.map((c) => ({ priority: c.priority, status: latest.get(c.id)?.execution_status ?? "NOT_EXECUTED" })));
  const everFailed = allResults.some((x) => x.execution_status === "FAILED");
  const overall = computeOverallStatus(
    cases.map((c) => latest.get(c.id)?.execution_status ?? "NOT_EXECUTED"),
    everFailed,
    runs.some((x) => x.run_type !== "initial"),
  );

  const summary = await generateInspectionSummary({
    url: inspection.website_url,
    healthScore: score.score,
    tests: cases.map((c) => {
      const res = latest.get(c.id) ?? null;
      return { test: c, result: res, analysis: res ? (analysisFor.get(res.id) ?? null) : null };
    }),
  });

  await r.updateRun(run.id, {
    status: "completed",
    completed_at: now(),
    health_score: runScore.score,
    passed: count("PASSED"),
    failed: count("FAILED"),
    inconclusive: count("INCONCLUSIVE") + count("TIMEOUT"),
    errored: count("ERROR"),
  });
  await r.updateInspection(run.inspection_id, {
    status: "completed",
    completed_at: now(),
    health_score: score.score,
    overall_status: overall,
    summary,
  });
  log("run_finalized", { runId: run.id, overall, score: score.score });
}

// ------------------------------------------------------------------ retest
export class RetestError extends Error {}

export async function createRetest(inspectionId: string, scope: "failed" | "all"): Promise<VerificationRun> {
  const r = repo();
  const inspection = await r.getInspection(inspectionId);
  if (!inspection) throw new RetestError("Inspection not found.");
  const runs = await r.listRuns(inspectionId);
  const last = runs.at(-1);
  if (!last || last.status !== "completed" || inspection.status !== "completed") {
    throw new RetestError("Wait for the current run to finish before retesting.");
  }
  const cases = await r.listTestCases(inspectionId);
  const targets = scope === "all" ? cases : cases.filter((c) => c.status !== "PASSED");
  if (targets.length === 0) throw new RetestError("There are no failed or unverified tests to retest.");

  const runType: RunType = scope === "all" ? "retest_all" : "retest_failed";
  const run = await r.createRun({
    inspection_id: inspectionId,
    parent_run_id: last.id,
    sequence: last.sequence + 1,
    run_type: runType,
    status: "queued",
    test_case_ids: targets.map((c) => c.id),
    health_score: null,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    errored: 0,
    error: null,
    started_at: now(),
    completed_at: null,
  });
  await r.updateInspection(inspectionId, { status: "planning", latest_run_id: run.id, completed_at: null });
  return run;
}

/** Background step: Groq writes focused retest objectives from the real previous results, then Kane runs them. */
export async function planAndDispatchRetest(runId: string): Promise<void> {
  const r = repo();
  const run = await r.getRun(runId);
  if (!run) return;
  const inspection = (await r.getInspection(run.inspection_id))!;
  try {
    const cases = (await r.listTestCases(run.inspection_id)).filter((c) => run.test_case_ids.includes(c.id));
    const prev = run.parent_run_id ? await r.listResultsForCases(cases.map((c) => c.id)) : [];
    const runs = await r.listRuns(run.inspection_id);
    const seq = new Map(runs.map((x) => [x.id, x.sequence]));
    const latestPrev = new Map<string, TestResult>();
    for (const res of prev) {
      if (res.verification_run_id === run.id) continue;
      const cur = latestPrev.get(res.test_case_id);
      if (!cur || (seq.get(res.verification_run_id) ?? 0) > (seq.get(cur.verification_run_id) ?? 0)) latestPrev.set(res.test_case_id, res);
    }
    const analyses = await r.listAnalyses([...latestPrev.values()].map((x) => x.id));
    const aFor = new Map(analyses.map((a) => [a.test_result_id, a]));

    const plan = await generateRetestPlan({
      url: inspection.website_url,
      items: cases.map((c) => {
        const res = latestPrev.get(c.id) ?? null;
        return { test: c, result: res, analysis: res ? (aFor.get(res.id) ?? null) : null };
      }),
    });
    log("retest_planned", { runId, source: plan.source, tests: cases.length });
    await r.updateRun(runId, { status: "dispatching" });
    await r.updateInspection(inspection.id, { status: "dispatching" });
    await dispatchRun(
      inspection,
      { ...run, status: "dispatching" },
      cases.map((c) => {
        const p = plan.objectives.get(c.id)!;
        return { test: c, objective: p.objective, note: plan.source === "groq" ? p.rationale : "Groq unavailable — previous objective re-run unchanged." };
      }),
    );
  } catch (err) {
    console.error("[retest] failed", err);
    await r.updateRun(runId, { status: "failed", error: (err as Error).message, completed_at: now() });
    await r.updateInspection(inspection.id, { status: "completed", error: `Retest failed to start: ${(err as Error).message}` });
  }
}

// ------------------------------------------------------------------ sync / recovery
const lastSync = new Map<string, number>();

/**
 * Pull-based recovery: if callbacks were missed (worker can't reach the app,
 * app restarted), fetch the job from the worker and ingest finished tests.
 */
export async function syncRunFromWorker(run: VerificationRun): Promise<void> {
  if (run.status !== "running" && run.status !== "dispatching") return;
  const last = lastSync.get(run.id) ?? 0;
  if (Date.now() - last < 4000) return;
  lastSync.set(run.id, Date.now());
  const r = repo();
  const results = await r.listResultsForRun(run.id);
  try {
    const job = await getWorkerJob(run.id);
    for (const t of job.tests) {
      const cur = results.find((x) => x.test_case_id === t.testCaseId);
      if (cur && isTerminal(cur.execution_status)) continue;
      if (isTerminal(t.status)) await ingestOutcome(run, t);
      else if (t.status === "RUNNING") await handleWorkerEvent({ type: "test_progress", jobId: run.id, test: t });
    }
    if (job.status === "completed") await maybeFinalizeRun(run.id);
  } catch (err) {
    if (err instanceof WorkerError && err.status === 404) {
      const age = Date.now() - Date.parse(run.started_at ?? run.created_at);
      if (age < 30_000) return; // job may not be registered yet
      for (const res of results.filter((x) => !isTerminal(x.execution_status))) {
        await ingestOutcome(run, {
          testCaseId: res.test_case_id,
          objective: res.objective,
          status: "ERROR",
          errorKind: "worker",
          steps: res.steps,
          stdout: null,
          stderr: "The Kane worker has no record of this job (it may have restarted).",
          exitCode: null,
          durationMs: null,
          summary: null,
          reason: "Worker lost the job",
          testUrl: null,
          evidenceReference: null,
          cliVersion: null,
          startedAt: res.started_at,
          completedAt: now(),
        });
      }
    }
    // Other errors (worker temporarily unreachable): try again on the next poll.
  }
}

/** Mark inspections whose background planning died (e.g. function timeout) as failed. */
async function recoverStalled(inspection: Inspection, runs: VerificationRun[]) {
  const age = Date.now() - Date.parse(inspection.created_at);
  if (inspection.status === "planning" && runs.length === 0 && age > 5 * 60_000) {
    await repo().updateInspection(inspection.id, { status: "failed", error: "Planning did not complete. Please start a new inspection." });
  }
}

// ------------------------------------------------------------------ read models
export async function getReport(id: string, opts: { sync?: boolean } = {}): Promise<InspectionReport | null> {
  const r = repo();
  let inspection = await r.getInspection(id);
  if (!inspection) return null;
  let runs = await r.listRuns(id);

  if (opts.sync) {
    await recoverStalled(inspection, runs);
    const active = runs.find((x) => x.status === "running" || x.status === "dispatching");
    if (active) {
      await syncRunFromWorker(active);
      // Results may all be in but finalisation not yet triggered (e.g. lost job_completed).
      await maybeFinalizeRun(active.id);
    }
    inspection = (await r.getInspection(id))!;
    runs = await r.listRuns(id);
  }

  const cases = await r.listTestCases(id);
  const results = await r.listResultsForCases(cases.map((c) => c.id));
  const analyses = await r.listAnalyses(results.map((x) => x.id));
  const aFor = new Map<string, AiAnalysis>(analyses.map((a) => [a.test_result_id, a]));
  const seq = new Map(runs.map((x) => [x.id, x.sequence]));

  return {
    inspection,
    runs,
    tests: cases.map((c) => ({
      ...c,
      results: results
        .filter((x) => x.test_case_id === c.id)
        .sort((a, b) => (seq.get(a.verification_run_id) ?? 0) - (seq.get(b.verification_run_id) ?? 0))
        .map((x) => ({ ...x, analysis: aFor.get(x.id) ?? null })),
    })),
  };
}
