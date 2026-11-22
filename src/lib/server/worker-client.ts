import "server-only";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/server/config";
import type { ArtifactKind, ErrorKind, ExecutionStatus, KaneStep } from "@/lib/types";

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
  /** Proof of Fix evidence (unvalidated here; see sanitizeEvidence). */
  evidence?: unknown;
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

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Download one captured screenshot from the worker. Only the configured worker
 * URL and a fixed path are ever requested; the size is capped while streaming.
 */
export async function fetchWorkerArtifact(jobId: string, testCaseId: string, kind: ArtifactKind, maxBytes: number): Promise<Uint8Array> {
  const w = requireWorker();
  if (!SAFE_ID.test(jobId) || !SAFE_ID.test(testCaseId)) throw new WorkerError("Invalid artifact identifiers");
  let res: Response;
  try {
    res = await fetch(`${w.url}/jobs/${jobId}/artifacts/${testCaseId}/${kind}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${w.secret}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new WorkerError(`Worker unreachable while fetching evidence: ${(err as Error).message}`);
  }
  if (!res.ok || !res.body) throw new WorkerError(`Worker returned HTTP ${res.status} for evidence`, res.status);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new WorkerError("Evidence artifact exceeds the size limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
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
