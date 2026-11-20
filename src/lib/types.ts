/**
 * CECH domain types.
 *
 * Two layers are kept strictly separate for every test:
 *  - ExecutionStatus: what Kane CLI actually observed in a real browser.
 *  - AiAnalysis:      Groq's interpretation of that observation.
 * The AI layer can never change the execution layer.
 */

export const TEST_CATEGORIES = ["navigation", "forms", "interface", "journey"] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "PASSED",
  "FAILED",
  "ERROR",
  "TIMEOUT",
  "INCONCLUSIVE",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** Why an execution did not produce a website verdict. */
export type ErrorKind =
  | "auth"
  | "browser"
  | "network"
  | "worker"
  | "url_rejected"
  | "timeout"
  | "no_verdict"
  | "blocked_by_site"
  | "unknown";

export type InspectionStatus =
  | "planning"
  | "dispatching"
  | "running"
  | "analyzing"
  | "completed"
  | "failed";

export type RunType = "initial" | "retest_failed" | "retest_all";
export type RunStatus = "queued" | "dispatching" | "running" | "analyzing" | "completed" | "failed";

/** Overall verdict for an inspection, derived from the latest Kane outcome per test. */
export type OverallStatus =
  | "pending"
  | "passed"
  | "issues_found"
  | "verified"
  | "incomplete";

export type Severity = "critical" | "high" | "medium" | "low" | "none";
export type Confidence = "high" | "medium" | "low";
export type PlanSource = "groq" | "baseline";
export type AnalysisSource = "groq" | "system" | "unavailable";

export interface Inspection {
  id: string;
  user_id: string | null;
  website_url: string;
  status: InspectionStatus;
  overall_status: OverallStatus;
  selected_categories: TestCategory[];
  custom_instructions: string | null;
  health_score: number | null;
  plan_source: PlanSource | null;
  plan_notes: string | null;
  summary: InspectionSummary | null;
  error: string | null;
  latest_run_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TestCase {
  id: string;
  inspection_id: string;
  key: string;
  category: TestCategory;
  title: string;
  objective: string;
  expected_outcome: string;
  priority: Priority;
  assumption: string | null;
  /** Latest browser execution status across runs. */
  status: ExecutionStatus | "NOT_EXECUTED";
  position: number;
  created_at: string;
}

export interface KaneStep {
  step: number;
  status: string;
  remark: string;
}

export interface TestResult {
  id: string;
  test_case_id: string;
  verification_run_id: string;
  /** The exact objective string Kane executed for this run. */
  objective: string;
  /** Why this objective was chosen (retest rationale from Groq), if any. */
  objective_note: string | null;
  execution_status: ExecutionStatus;
  error_kind: ErrorKind | null;
  raw_output: string | null;
  stderr: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  evidence_reference: string | null;
  kane_summary: string | null;
  kane_reason: string | null;
  kane_test_url: string | null;
  steps: KaneStep[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AiAnalysis {
  id: string;
  test_result_id: string;
  source: AnalysisSource;
  summary: string;
  issue_detected: boolean | null;
  severity: Severity | null;
  title: string | null;
  description: string | null;
  expected_behavior: string | null;
  observed_behavior: string | null;
  recommendation: string | null;
  confidence: Confidence | null;
  model: string | null;
  created_at: string;
}

export interface VerificationRun {
  id: string;
  inspection_id: string;
  parent_run_id: string | null;
  sequence: number;
  run_type: RunType;
  status: RunStatus;
  test_case_ids: string[];
  health_score: number | null;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface InspectionSummary {
  headline: string;
  overview: string;
  key_issues: string[];
  next_steps: string[];
  source: AnalysisSource;
}

/** Full report shape returned by GET /api/inspections/:id */
export interface InspectionReport {
  inspection: Inspection;
  runs: VerificationRun[];
  tests: Array<
    TestCase & {
      results: Array<TestResult & { analysis: AiAnalysis | null }>;
    }
  >;
}

export interface DemoSettings {
  mode: "healthy" | "broken";
  updated_at: string;
}

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  navigation: "Navigation",
  forms: "Forms",
  interface: "Interface",
  journey: "User Journey",
};

export const PRIORITY_WEIGHTS: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export const TERMINAL_STATUSES: ExecutionStatus[] = [
  "PASSED",
  "FAILED",
  "ERROR",
  "TIMEOUT",
  "INCONCLUSIVE",
];

export function isTerminal(status: ExecutionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
