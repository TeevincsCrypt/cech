import type { ErrorKind, ExecutionStatus } from "@/lib/types";

export const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
  auth: "Kane not authenticated",
  browser: "Browser failed to start",
  network: "Network error",
  worker: "Worker error",
  url_rejected: "URL rejected by worker",
  timeout: "Timed out",
  no_verdict: "No verdict from Kane",
  blocked_by_site: "Site blocked automation",
  unknown: "Unknown error",
};

/** What to do when this cause stops tests reaching a pass/fail verdict. */
export const ERROR_KIND_ADVICE: Partial<Record<ErrorKind, string>> = {
  timeout:
    "Pages took longer than the worker's per-test limit. Raise KANE_TEST_TIMEOUT_SEC on the worker (for example 300), or narrow the instructions.",
  blocked_by_site:
    "The site challenged Kane's automated browser (bot protection, captcha or a login wall). CECH can't verify pages it can't reach — try a staging URL without bot protection.",
  auth: "Kane isn't logged in on the worker. Check LT_USERNAME / LT_ACCESS_KEY there, then retest.",
  worker: "The Kane worker failed or was unreachable. Check the worker's logs and /health, then retest.",
  browser: "Chrome failed to start on the worker. Check the worker has enough memory (1–2 GB), then retest.",
  network: "The worker couldn't reach the site. Check the URL is publicly reachable, then retest.",
  no_verdict: "Kane exited without reporting a verdict. Open a test's execution log for details, then retest.",
};

export type NonConclusive = { key: string; label: string; count: number; advice: string | null };

/** Group non-conclusive latest outcomes by cause, most frequent first. */
export function nonConclusiveBreakdown(results: Array<{ execution_status: ExecutionStatus | "NOT_EXECUTED"; error_kind: ErrorKind | null } | null>): NonConclusive[] {
  const map = new Map<string, NonConclusive>();
  for (const r of results) {
    const status = r?.execution_status ?? "NOT_EXECUTED";
    if (status === "PASSED" || status === "FAILED") continue;
    const kind: ErrorKind | null = r?.error_kind ?? (status === "TIMEOUT" ? "timeout" : null);
    const key = kind ?? status;
    const label = kind
      ? ERROR_KIND_LABEL[kind]
      : status === "INCONCLUSIVE"
        ? "Inconclusive"
        : status === "QUEUED" || status === "RUNNING"
          ? "Still running"
          : "Not executed";
    const cur = map.get(key) ?? { key, label, count: 0, advice: kind ? (ERROR_KIND_ADVICE[kind] ?? null) : null };
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
