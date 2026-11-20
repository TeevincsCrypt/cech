import "server-only";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/server/config";
import type { ErrorKind, ExecutionStatus, KaneStep } from "@/lib/types";

/** Shape returned by the worker for each test (see worker/src/jobs.ts). */
export interface WorkerTestOutcome {
  testCaseId: string;
  objective: string;
  status: ExecutionStatus;
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
}

export interface WorkerJob {
  id: string;
  url: string;
  status: "queued" | "running" | "completed";
  tests: WorkerTestOutcome[];
}

export class WorkerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

function requireWorker() {
  if (!config.worker.url || !config.worker.secret) {
    throw new WorkerError("Kane worker is not configured (set KANE_WORKER_URL and KANE_WORKER_SECRET).");
  }
  return { url: config.worker.url, secret: config.worker.secret };
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const w = requireWorker();
  let res: Response;
  try {
    res = await fetch(`${w.url}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${w.secret}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
  } catch (err) {
    throw new WorkerError(`Kane worker unreachable at ${w.url}: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new WorkerError(body.error ?? `Kane worker returned HTTP ${res.status}`, res.status);
  return body;
}

export function submitWorkerJob(job: { jobId: string; url: string; tests: Array<{ testCaseId: string; objective: string }> }) {
  return call<{ jobId: string; status: string }>("/jobs", { method: "POST", body: JSON.stringify(job) });
}

export function getWorkerJob(jobId: string) {
  return call<WorkerJob>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function getWorkerHealth(): Promise<Record<string, unknown> | null> {
  if (!config.worker.url) return null;
  try {
    const res = await fetch(`${config.worker.url}/health`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Constant-time check of the worker's bearer token on callbacks. */
export function isAuthorizedWorker(req: Request): boolean {
  if (!config.worker.secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(config.worker.secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
