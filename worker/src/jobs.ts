import { rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { emptyEvidence, startEvidenceSession, type EvidenceSession, type ExecutionEvidence } from "./evidence.js";
import { runKane, type KaneRunOutcome } from "./kane-runner.js";
import type { ExecutionStatus, ErrorKind, KaneStep } from "./kane-parser.js";
import { assertPublicUrl } from "./url-safety.js";

export interface JobTest {
  testCaseId: string;
  objective: string;
}

export interface TestOutcome {
  testCaseId: string;
  objective: string;
  status: "QUEUED" | "RUNNING" | ExecutionStatus;
  errorKind: ErrorKind | null;
  steps: KaneStep[];
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  summary: string | null;
  reason: string | null;
  testUrl: string | null;
  evidenceReference: string | null;
  cliVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Proof of Fix: worker-observed evidence from the same browser Kane drove. */
  evidence: ExecutionEvidence | null;
}

export interface Job {
  id: string;
  url: string;
  status: "queued" | "running" | "completed";
  createdAt: string;
  completedAt: string | null;
  tests: TestOutcome[];
}

type Listener = (event: { type: string; job: Job; test?: TestOutcome }) => void;

const jobs = new Map<string, Job>();
const queue: Array<{ job: Job; test: TestOutcome; controller: AbortController }> = [];
const controllers = new Map<string, AbortController>(); // per job
let active = 0;
let listener: Listener = () => {};

export function onJobEvent(fn: Listener) {
  listener = fn;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function stats() {
  return {
    activeTests: active,
    queuedTests: queue.length,
    jobs: [...jobs.values()].filter((j) => j.status !== "completed").length,
    concurrency: config.concurrency,
  };
}

function emptyOutcome(t: JobTest): TestOutcome {
  return {
    testCaseId: t.testCaseId,
    objective: t.objective,
    status: "QUEUED",
    errorKind: null,
    steps: [],
    stdout: null,
    stderr: null,
    exitCode: null,
    durationMs: null,
    summary: null,
    reason: null,
    testUrl: null,
    evidenceReference: null,
    cliVersion: null,
    startedAt: null,
    completedAt: null,
    evidence: null,
  };
}

/** Directory holding one test's captured artifacts (ids are validated at the API). */
export function artifactDir(jobId: string, testCaseId: string): string {
  return path.join(config.artifactRoot, jobId, testCaseId);
}

export function submitJob(id: string, url: string, tests: JobTest[]): Job {
  const existing = jobs.get(id);
  if (existing) return existing; // idempotent re-submit
  const openJobs = [...jobs.values()].filter((j) => j.status !== "completed").length;
  if (openJobs >= config.maxQueuedJobs) throw new Error("Worker queue is full; try again shortly.");

  const job: Job = {
    id,
    url,
    status: "queued",
    createdAt: new Date().toISOString(),
    completedAt: null,
    tests: tests.map(emptyOutcome),
  };
  jobs.set(id, job);
  const controller = new AbortController();
  controllers.set(id, controller);

  // Overall inspection timeout: abort running tests, settle queued ones.
  setTimeout(() => {
    if (job.status === "completed") return;
    controller.abort();
    for (const t of job.tests) {
      if (t.status === "QUEUED") {
        settle(job, t, {
          status: "TIMEOUT",
          errorKind: "timeout",
          reason: `Overall inspection time limit (${config.jobTimeoutSec}s) reached before this test started.`,
        });
      }
    }
  }, config.jobTimeoutSec * 1000).unref();

  for (const t of job.tests) queue.push({ job, test: t, controller });
  pump();
  pruneOldJobs();
  return job;
}

function settle(job: Job, test: TestOutcome, patch: Partial<TestOutcome>) {
  Object.assign(test, patch, { completedAt: patch.completedAt ?? new Date().toISOString() });
  listener({ type: "test_completed", job, test });
  if (job.tests.every((t) => t.status !== "QUEUED" && t.status !== "RUNNING")) {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    controllers.delete(job.id);
    listener({ type: "job_completed", job });
  }
}

function pump() {
  while (active < config.concurrency && queue.length > 0) {
    const item = queue.shift()!;
    if (item.test.status !== "QUEUED") continue; // already settled (job timeout)
    active++;
    execute(item.job, item.test, item.controller.signal).finally(() => {
      active--;
      pump();
    });
  }
}

async function execute(job: Job, test: TestOutcome, signal: AbortSignal) {
  job.status = "running";
  test.status = "RUNNING";
  test.startedAt = new Date().toISOString();
  listener({ type: "test_started", job, test });

  // Independent SSRF re-check immediately before the browser launches.
  const safe = await assertPublicUrl(job.url, { allowlist: config.ssrfAllowlist });
  if (!safe.ok) {
    settle(job, test, { status: "ERROR", errorKind: "url_rejected", reason: safe.reason, durationMs: 0 });
    return;
  }

  // Proof of Fix: open an evidence session on a Chrome the worker controls and
  // capture the page before Kane acts. Failure here never blocks the test.
  let session: EvidenceSession | null = null;
  const captureErrors: string[] = [];
  if (config.evidence) {
    try {
      session = await startEvidenceSession({ artifactDir: artifactDir(job.id, test.testCaseId), headless: config.headless });
      await session.captureBefore(safe.normalized);
    } catch (err) {
      captureErrors.push(`Evidence capture unavailable: ${(err as Error).message.split("\n")[0]}`);
      await session?.close();
      session = null;
    }
  }

  const run = (s: EvidenceSession | null) =>
    runKane({
      objective: test.objective,
      url: safe.normalized,
      timeoutSec: config.testTimeoutSec,
      signal,
      cdpEndpoint: s?.cdpEndpoint,
      onSteps: (steps) => {
        test.steps = steps;
        listener({ type: "test_progress", job, test });
      },
      onEvent: (evt) => {
        if (!s) return;
        if (typeof evt.step === "number" && evt.status === "failed") s.captureFailure();
        if (evt.type === "run_end") s.captureAfter();
      },
    });

  let outcome: KaneRunOutcome;
  let evidence: ExecutionEvidence;
  try {
    outcome = await run(session);
    // Safety net: if Kane could not drive the evidence browser at all, re-run it
    // exactly as before (Kane launches its own Chrome) and record why.
    if (session && outcome.status === "ERROR" && outcome.errorKind === "browser" && outcome.steps.length === 0) {
      captureErrors.push(`Kane could not use the evidence browser (${outcome.reason ?? "browser error"}); re-ran without evidence capture.`);
      await session.close();
      session = null;
      await rm(outcome.workdir, { recursive: true, force: true }).catch(() => {});
      outcome = await run(null);
    }
    const packDirs = [path.join(outcome.workdir, ".testmuai"), outcome.sessionDir ?? ""];
    evidence = session ? await session.finish(outcome.status, packDirs) : emptyEvidence();
    evidence.capture_errors.unshift(...captureErrors);
  } catch (err) {
    await session?.close();
    settle(job, test, { status: "ERROR", errorKind: "worker", reason: `Worker error: ${(err as Error).message}`, evidence: emptyEvidence(captureErrors) });
    return;
  }
  await session?.close();
  rm(outcome.workdir, { recursive: true, force: true }).catch(() => {});

  console.log(
    JSON.stringify({
      evt: "kane_run",
      job: job.id,
      test: test.testCaseId,
      status: outcome.status,
      evidence: evidence.artifacts.map((a) => a.kind),
      captureErrors: evidence.capture_errors.length,
      errorKind: outcome.errorKind,
      exit: outcome.exitCode,
      ms: outcome.durationMs,
      steps: outcome.steps.length,
    }),
  );
  settle(job, test, {
    status: outcome.status,
    errorKind: outcome.errorKind,
    steps: outcome.steps,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
    summary: outcome.summary,
    reason: outcome.reason,
    testUrl: outcome.testUrl,
    evidenceReference: outcome.evidenceReference,
    cliVersion: outcome.cliVersion,
    startedAt: outcome.startedAt,
    completedAt: outcome.completedAt,
    evidence,
  });
}

function pruneOldJobs() {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [id, j] of jobs) {
    if (j.status === "completed" && j.completedAt && Date.parse(j.completedAt) < cutoff) {
      jobs.delete(id);
      rm(path.join(config.artifactRoot, id), { recursive: true, force: true }).catch(() => {});
    }
  }
}
