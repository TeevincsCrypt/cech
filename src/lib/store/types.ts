import type {
  AiAnalysis,
  DemoSettings,
  EvidenceArtifact,
  FixVerification,
  Inspection,
  RunStatus,
  TestCase,
  TestResult,
  VerificationRun,
} from "@/lib/types";

export type NewInspection = Omit<Inspection, "id" | "created_at">;
export type NewTestCase = Omit<TestCase, "id" | "created_at">;
export type NewRun = Omit<VerificationRun, "id" | "created_at">;
export type NewResult = Omit<TestResult, "id" | "created_at">;
export type NewAnalysis = Omit<AiAnalysis, "id" | "created_at">;
export type NewArtifact = Omit<EvidenceArtifact, "id" | "created_at">;
export type NewFixVerification = Omit<FixVerification, "id" | "created_at">;

export interface DashboardStats {
  totalInspections: number;
  totalTestsExecuted: number;
  testsPassed: number;
  issuesDetected: number;
}

/**
 * Storage abstraction. Production uses Supabase PostgreSQL; local development
 * without Supabase credentials uses a JSON file. Both persist real data only.
 */
export interface Repository {
  readonly kind: "supabase" | "local-file";

  createInspection(data: NewInspection): Promise<Inspection>;
  getInspection(id: string): Promise<Inspection | null>;
  listInspections(limit?: number): Promise<Inspection[]>;
  updateInspection(id: string, patch: Partial<Inspection>): Promise<void>;

  createTestCases(cases: NewTestCase[]): Promise<TestCase[]>;
  listTestCases(inspectionId: string): Promise<TestCase[]>;
  listTestCasesForInspections(inspectionIds: string[]): Promise<TestCase[]>;
  updateTestCase(id: string, patch: Partial<TestCase>): Promise<void>;

  createRun(run: NewRun): Promise<VerificationRun>;
  getRun(id: string): Promise<VerificationRun | null>;
  listRuns(inspectionId: string): Promise<VerificationRun[]>;
  listRecentRuns(limit: number): Promise<VerificationRun[]>;
  updateRun(id: string, patch: Partial<VerificationRun>): Promise<void>;
  /** Compare-and-set: only applies when the current status is in `from`. */
  transitionRun(
    id: string,
    from: RunStatus[],
    patch: Partial<VerificationRun> & { status: RunStatus },
  ): Promise<boolean>;

  /** Insert or update the result for (verification_run_id, test_case_id). */
  upsertResult(result: NewResult): Promise<TestResult>;
  listResultsForRun(runId: string): Promise<TestResult[]>;
  listResultsForCases(testCaseIds: string[]): Promise<TestResult[]>;

  upsertAnalysis(analysis: NewAnalysis): Promise<AiAnalysis>;
  listAnalyses(testResultIds: string[]): Promise<AiAnalysis[]>;

  getStats(): Promise<DashboardStats>;

  // ---- Proof of Fix
  /** False when the Proof of Fix migration hasn't been applied (Supabase). */
  evidenceSupported(): Promise<boolean>;
  /** Insert or replace the artifact for (test_result_id, kind). */
  upsertArtifact(artifact: NewArtifact): Promise<EvidenceArtifact>;
  getArtifact(id: string): Promise<EvidenceArtifact | null>;
  listArtifactsForInspection(inspectionId: string): Promise<EvidenceArtifact[]>;
  /** Insert or update the verification for (original_result_id, retest_result_id). */
  upsertFixVerification(v: NewFixVerification): Promise<FixVerification>;
  listFixVerifications(inspectionId: string): Promise<FixVerification[]>;

  getDemoSettings(): Promise<DemoSettings>;
  setDemoMode(mode: DemoSettings["mode"]): Promise<DemoSettings>;
}
