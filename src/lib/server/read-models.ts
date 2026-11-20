import "server-only";
import { getRepository } from "@/lib/store";
import type { Inspection, VerificationRun } from "@/lib/types";

export interface InspectionListItem {
  id: string;
  website_url: string;
  created_at: string;
  completed_at: string | null;
  status: Inspection["status"];
  overall_status: Inspection["overall_status"];
  health_score: number | null;
  tests: number;
  executed: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  runs: number;
  /** Tests that FAILED in an earlier run and PASSED in the latest one. */
  resolved: number;
  /** Tests that FAILED in both of their two most recent runs. */
  recurring: number;
}

export interface ActivityItem {
  id: string;
  inspection_id: string;
  website_url: string;
  kind: VerificationRun["run_type"];
  status: VerificationRun["status"];
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  tests: number;
  at: string;
}

/** Counts reflect the latest real Kane outcome of each test case. */
export async function listInspectionSummaries(limit = 50): Promise<InspectionListItem[]> {
  const repo = getRepository();
  const inspections = await repo.listInspections(limit);
  const cases = await repo.listTestCasesForInspections(inspections.map((i) => i.id));
  const runs = await repo.listRecentRuns(500);
  const seq = new Map(runs.map((r) => [r.id, r.sequence]));
  // Resolution tracking only needs results for inspections that were retested.
  const retested = new Set(inspections.filter((i) => runs.filter((r) => r.inspection_id === i.id).length > 1).map((i) => i.id));
  const retestedCases = cases.filter((c) => retested.has(c.inspection_id));
  const results = retestedCases.length ? await repo.listResultsForCases(retestedCases.map((c) => c.id)) : [];
  const history = new Map<string, string[]>();
  for (const res of [...results].sort((a, b) => (seq.get(a.verification_run_id) ?? 0) - (seq.get(b.verification_run_id) ?? 0))) {
    if (!["PASSED", "FAILED", "INCONCLUSIVE", "TIMEOUT", "ERROR"].includes(res.execution_status)) continue;
    history.set(res.test_case_id, [...(history.get(res.test_case_id) ?? []), res.execution_status]);
  }
  return inspections.map((i) => {
    const own = cases.filter((c) => c.inspection_id === i.id);
    const n = (s: string) => own.filter((c) => c.status === s).length;
    return {
      id: i.id,
      website_url: i.website_url,
      created_at: i.created_at,
      completed_at: i.completed_at,
      status: i.status,
      overall_status: i.overall_status,
      health_score: i.health_score,
      tests: own.length,
      executed: n("PASSED") + n("FAILED") + n("INCONCLUSIVE") + n("TIMEOUT"),
      passed: n("PASSED"),
      failed: n("FAILED"),
      inconclusive: n("INCONCLUSIVE") + n("TIMEOUT"),
      errored: n("ERROR"),
      runs: runs.filter((r) => r.inspection_id === i.id).length,
      resolved: own.filter((c) => {
        const h = history.get(c.id) ?? [];
        return h.length > 1 && h.at(-1) === "PASSED" && h.slice(0, -1).includes("FAILED");
      }).length,
      recurring: own.filter((c) => {
        const h = history.get(c.id) ?? [];
        return h.length > 1 && h.at(-1) === "FAILED" && h.at(-2) === "FAILED";
      }).length,
    };
  });
}

export async function getDashboard() {
  const repo = getRepository();
  const [stats, recent, runs, inspections] = await Promise.all([
    repo.getStats(),
    listInspectionSummaries(6),
    repo.listRecentRuns(10),
    repo.listInspections(200),
  ]);
  const urlOf = new Map(inspections.map((i) => [i.id, i.website_url]));
  const activity: ActivityItem[] = runs.map((r) => ({
    id: r.id,
    inspection_id: r.inspection_id,
    website_url: urlOf.get(r.inspection_id) ?? "",
    kind: r.run_type,
    status: r.status,
    passed: r.passed,
    failed: r.failed,
    inconclusive: r.inconclusive,
    errored: r.errored,
    tests: r.test_case_ids.length,
    at: r.completed_at ?? r.started_at ?? r.created_at,
  }));
  const trend = inspections
    .filter((i) => i.health_score != null)
    .slice(0, 12)
    .reverse()
    .map((i) => ({ id: i.id, score: i.health_score as number, at: i.created_at, url: i.website_url }));
  return { stats, recent, activity, trend };
}
