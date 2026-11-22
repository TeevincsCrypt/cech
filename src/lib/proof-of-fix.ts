import type { ExecutionStatus } from "@/lib/types";

/**
 * Proof of Fix verification engine (pure; shared by server and UI).
 *
 * A fix is VERIFIED only when, for the SAME test case:
 *   1. an earlier Kane execution genuinely FAILED,
 *   2. a later Kane execution of that test genuinely PASSED, and
 *   3. the two executions are equivalent: identical expected outcome and the
 *      same start URL (objective wording may be a focused retest, or identical
 *      for an exact replay).
 * AI output is never an input. TIMEOUT / INCONCLUSIVE / ERROR never count as
 * a pass or a failure. A verified test that later fails becomes REGRESSED.
 */

export type IssueState =
  | "not_executed" // no conclusive verdict yet and never failed
  | "passing" // passed, never failed
  | "open" // latest conclusive verdict is a failure (first occurrence)
  | "recurring" // failed again after a previous failure
  | "regressed" // failed after having passed
  | "resolved" // passed after failing, but equivalence could not be confirmed
  | "verified"; // Proof of Fix: genuine fail → genuine equivalent pass

export interface ResultLike {
  id: string;
  test_case_id: string;
  execution_status: ExecutionStatus;
  objective: string;
  expected_outcome?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
}

export interface ProofPair<R extends ResultLike = ResultLike> {
  original: R;
  retest: R;
  equivalence: "exact_objective" | "same_expected_outcome";
  /** Milliseconds between the original execution and the retest. */
  elapsedMs: number | null;
}

export interface IssueEvaluation<R extends ResultLike = ResultLike> {
  state: IssueState;
  proof: ProofPair<R> | null;
  /** Why a pass after a failure was not accepted as proof (when state = resolved). */
  notVerifiedReason: string | null;
  /** Extra context, e.g. "latest retest timed out". */
  note: string | null;
  /** The failing result that caused a regression (state = regressed). */
  regressedBy: R | null;
}

const CONCLUSIVE = new Set<ExecutionStatus>(["PASSED", "FAILED"]);
const INCONCLUSIVE_LABEL: Partial<Record<ExecutionStatus, string>> = {
  TIMEOUT: "timed out",
  INCONCLUSIVE: "was inconclusive (e.g. blocked automation)",
  ERROR: "did not execute (infrastructure error)",
};

/** Extract the start URL from a "Go to <url> and …" objective. */
export function startUrlOf(objective: string): string | null {
  const m = objective.match(/^go to\s+(\S+?)[,.]?\s+and\b/i) ?? objective.match(/^go to\s+(\S+)/i);
  if (!m) return null;
  try {
    const u = new URL(m[1]);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Are two executions of a test equivalent enough to compare as before/after? */
export function checkEquivalence(
  original: ResultLike,
  retest: ResultLike,
  testExpectedOutcome: string,
): { ok: true; kind: "exact_objective" | "same_expected_outcome" } | { ok: false; reason: string } {
  if (original.test_case_id !== retest.test_case_id) return { ok: false, reason: "The retest belongs to a different test." };
  const eo1 = original.expected_outcome ?? testExpectedOutcome;
  const eo2 = retest.expected_outcome ?? testExpectedOutcome;
  if (norm(eo1) !== norm(eo2)) return { ok: false, reason: "The expected outcome changed between the original test and the retest." };
  const u1 = startUrlOf(original.objective);
  const u2 = startUrlOf(retest.objective);
  if (!u1 || !u2 || u1 !== u2) return { ok: false, reason: "The retest did not start from the same URL as the original test." };
  return { ok: true, kind: norm(original.objective) === norm(retest.objective) ? "exact_objective" : "same_expected_outcome" };
}

function time(r: ResultLike): number | null {
  const t = r.completed_at ?? r.started_at ?? r.created_at;
  return t ? Date.parse(t) : null;
}

/**
 * Evaluate one test's issue state from its results ordered oldest → newest.
 * Results belonging to other tests are ignored (never compared).
 */
export function evaluateIssue<R extends ResultLike>(test: { id: string; expected_outcome: string }, orderedResults: R[]): IssueEvaluation<R> {
  const results = orderedResults.filter((r) => r.test_case_id === test.id);
  const none: IssueEvaluation<R> = { state: "not_executed", proof: null, notVerifiedReason: null, note: null, regressedBy: null };
  if (results.length === 0) return none;

  const latest = results.at(-1)!;
  const conclusive = results.filter((r) => CONCLUSIVE.has(r.execution_status));
  const note = !CONCLUSIVE.has(latest.execution_status) && INCONCLUSIVE_LABEL[latest.execution_status] ? `Latest run ${INCONCLUSIVE_LABEL[latest.execution_status]}.` : null;
  if (conclusive.length === 0) return { ...none, note };

  const last = conclusive.at(-1)!;
  if (last.execution_status === "FAILED") {
    const prev = conclusive.at(-2);
    const state: IssueState = !prev ? "open" : prev.execution_status === "PASSED" ? "regressed" : "recurring";
    return { state, proof: null, notVerifiedReason: null, note, regressedBy: state === "regressed" ? last : null };
  }

  // Latest conclusive verdict is PASSED.
  const lastFailIdx = conclusive.map((r) => r.execution_status).lastIndexOf("FAILED");
  if (lastFailIdx === -1) return { state: "passing", proof: null, notVerifiedReason: null, note, regressedBy: null };
  const original = conclusive[lastFailIdx];
  const retest = conclusive[lastFailIdx + 1]; // first genuine pass after that failure
  const eq = checkEquivalence(original, retest, test.expected_outcome);
  if (!eq.ok) return { state: "resolved", proof: null, notVerifiedReason: eq.reason, note, regressedBy: null };
  const t1 = time(original);
  const t2 = time(retest);
  return {
    state: "verified",
    proof: { original, retest, equivalence: eq.kind, elapsedMs: t1 != null && t2 != null ? t2 - t1 : null },
    notVerifiedReason: null,
    note,
    regressedBy: null,
  };
}

export const ISSUE_STATE_LABEL: Record<IssueState, string> = {
  not_executed: "Not executed",
  passing: "Passing",
  open: "Open",
  recurring: "Recurring",
  regressed: "Regressed",
  resolved: "Resolved",
  verified: "Verified",
};

export function formatElapsed(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
