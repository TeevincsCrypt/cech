import { config } from "./config.js";
import type { Job, TestOutcome } from "./jobs.js";

/**
 * Push job events to CECH (POST {CECH_APP_URL}/api/worker/callback).
 * The destination is fixed by worker configuration — never taken from the
 * request — so a job submission cannot redirect results elsewhere.
 * Delivery is best-effort with retries; CECH can always pull GET /jobs/:id.
 */
export async function sendCallback(type: string, job: Job, test?: TestOutcome): Promise<void> {
  if (!config.appUrl) return;
  const body = JSON.stringify({ type, jobId: job.id, jobStatus: job.status, test: test ?? null });
  const attempts = type === "test_progress" ? 1 : 4;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${config.appUrl}/api/worker/callback`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.secret}` },
        body,
        signal: AbortSignal.timeout(type === "test_completed" ? 90_000 : 15_000),
      });
      if (res.ok) return;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.warn(`[callback] ${type} rejected with ${res.status}`);
        return;
      }
    } catch (err) {
      if (i === attempts - 1) console.warn(`[callback] ${type} failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
}
