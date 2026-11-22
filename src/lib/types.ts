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
  /** Worker-observed execution evidence (null for results captured before Proof of Fix). */
  evidence?: ExecutionEvidence | null;
  /** Expected outcome snapshot at dispatch, for retest equivalence. */
  expected_outcome?: string | null;
}

export const ARTIFACT_KINDS = ["before", "at_failure", "after_viewport", "after_fullpage"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  before: "Before interaction",
  at_failure: "At failure",
  after_viewport: "After execution",
  after_fullpage: "After execution (full page)",
};

/**
 * Facts observed by the Kane worker in the same Chrome session Kane drove.
 * Every field is only present when the browser actually provided it.
 */
export interface ExecutionEvidence {
  mode: "cdp" | "none";
  viewport: { width: number; height: number; deviceScaleFactor: number } | null;
  url_before: string | null;
  url_after: string | null;
  console_errors: Array<{ text: string; url: string | null; at: string }>;
  failed_requests: Array<{ url: string; method: string; status: number | null; error: string | null; at: string }>;
  /** Problems capturing evidence. Never affects the Kane outcome. */
  capture_errors: string[];
  started_at: string | null;
  completed_at: string | null;
  /** Artifacts the worker captured (before transfer to CECH storage). */
  artifacts: Array<{ kind: ArtifactKind; content_type: "image/jpeg" | "image/png"; bytes: number; width: number | null; height: number | null; sha256: string; page_url: string | null; captured_at: string }>;
  kane_evidence_pack: { sealed: boolean; bytes: number | null } | null;
}

export interface EvidenceArtifact {
  id: string;
  inspection_id: string;
  test_case_id: string;
  test_result_id: string;
  verification_run_id: string;
  kind: ArtifactKind;
  storage_key: string;
  content_type: "image/jpeg" | "image/png";
  bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  page_url: string | null;
  captured_at: string;
  created_at: string;
}

export interface FixVerification {
  id: string;
  inspection_id: string;
  test_case_id: string;
  original_result_id: string;
  retest_result_id: string;
  equivalence: "exact_objective" | "same_expected_outcome";
  status: "verified" | "regressed";
  regressed_result_id: string | null;
  verified_at: string;
  regressed_at: string | null;
  created_at: string;
}

/** Evidence-grounded bug reproduction report (Groq), for genuine failures only. */
export interface BugReport {
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  feature: string;
  description: string;
  expected_behavior: string;
  actual_behavior: string;
  steps_to_reproduce: string[];
  observed_facts: string[];
  evidence_refs: string[];
  hypothesis: string;
  recommendation: string;
  retest_objective: string;
  evidence_sufficient: boolean;
  /** Claims removed by CECH because they referenced evidence that does not exist. */
  removed_claims: string[];
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
  bug_report?: BugReport | null;
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
      results: Array<TestResult & { analysis: AiAnalysis | null; artifacts: EvidenceArtifact[] }>;
    }
  >;
  verifications: FixVerification[];
  /** False when the Proof of Fix migration has not been applied to the database. */
  evidence_enabled: boolean;
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
