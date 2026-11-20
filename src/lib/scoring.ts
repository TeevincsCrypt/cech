import { PRIORITY_WEIGHTS, type ExecutionStatus, type OverallStatus, type Priority } from "@/lib/types";

export interface ScoredItem {
  priority: Priority;
  status: ExecutionStatus | "NOT_EXECUTED";
}

export interface HealthScore {
  score: number | null;
  passedWeight: number;
  conclusiveWeight: number;
  conclusiveCount: number;
  executedCount: number;
  reliable: boolean;
  reason: string | null;
}

export const MIN_CONCLUSIVE_TESTS = 2;

/**
 * Health Score = (passed weight / conclusive weight) × 100
 * Weights: high=3, medium=2, low=1.
 * Only PASSED and FAILED (conclusive Kane verdicts) contribute. ERROR, TIMEOUT,
 * INCONCLUSIVE and unexecuted tests are excluded — they are not website failures.
 * Requires ≥2 conclusive tests and conclusive tests to be at least half of
 * those attempted; otherwise the score is withheld.
 */
export function computeHealthScore(items: ScoredItem[]): HealthScore {
  const conclusive = items.filter((i) => i.status === "PASSED" || i.status === "FAILED");
  const attempted = items.filter((i) => i.status !== "NOT_EXECUTED" && i.status !== "QUEUED" && i.status !== "RUNNING");
  const conclusiveWeight = conclusive.reduce((s, i) => s + PRIORITY_WEIGHTS[i.priority], 0);
  const passedWeight = conclusive.filter((i) => i.status === "PASSED").reduce((s, i) => s + PRIORITY_WEIGHTS[i.priority], 0);

  let reason: string | null = null;
  if (conclusive.length < MIN_CONCLUSIVE_TESTS) {
    reason = `Only ${conclusive.length} test${conclusive.length === 1 ? "" : "s"} produced a conclusive pass/fail verdict (minimum ${MIN_CONCLUSIVE_TESTS}).`;
  } else if (conclusive.length * 2 < attempted.length) {
    reason = `Most executed tests were inconclusive or errored (${conclusive.length} of ${attempted.length} conclusive).`;
  }
  const reliable = reason === null && conclusiveWeight > 0;
  return {
    score: reliable ? Math.round((passedWeight / conclusiveWeight) * 100) : null,
    passedWeight,
    conclusiveWeight,
    conclusiveCount: conclusive.length,
    executedCount: attempted.length,
    reliable,
    reason,
  };
}

/**
 * Overall inspection verdict from the latest Kane status of each test.
 * "verified" = every test now passes AND at least one previously failed in an
 * earlier run (i.e. a fix was independently confirmed by a retest).
 */
export function computeOverallStatus(
  latest: Array<ExecutionStatus | "NOT_EXECUTED">,
  everFailed: boolean,
  hasRetest: boolean,
): OverallStatus {
  if (latest.length === 0) return "pending";
  if (latest.some((s) => s === "QUEUED" || s === "RUNNING")) return "pending";
  if (latest.some((s) => s === "FAILED")) return "issues_found";
  if (latest.every((s) => s === "PASSED")) return everFailed && hasRetest ? "verified" : "passed";
  return "incomplete";
}
