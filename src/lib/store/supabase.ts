import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AiAnalysis,
  DemoSettings,
  EvidenceArtifact,
  FixVerification,
  Inspection,
  TestCase,
  TestResult,
  VerificationRun,
} from "@/lib/types";
import { omit } from "@/lib/utils";
import type { DashboardStats, Repository } from "./types";

/**
 * Supabase PostgreSQL repository. Uses the service-role key and therefore must
 * only ever run on the server. Row Level Security is enabled on every table
 * (see supabase/migrations) with no anon policies, so the public anon key
 * cannot read or write CECH data directly.
 */
export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }

  private evidenceColumns: Promise<boolean> | null = null;

  /**
   * Detect (once) whether the Proof of Fix migration has been applied, so new
   * code can run against an old schema without failing core writes.
   */
  evidenceSupported(): Promise<boolean> {
    this.evidenceColumns ??= (async () => {
      const [a, b] = await Promise.all([
        this.db.from("test_results").select("evidence, expected_outcome").limit(1),
        this.db.from("evidence_artifacts").select("id").limit(1),
      ]);
      const ok = !a.error && !b.error;
      if (!ok) console.warn("[supabase] Proof of Fix migration not applied — evidence will not be stored", a.error?.message ?? b.error?.message);
      return ok;
    })().catch(() => false);
    return this.evidenceColumns;
  }

  private check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
    return res.data as T;
  }

  async createInspection(data: Parameters<Repository["createInspection"]>[0]) {
    return this.check(await this.db.from("inspections").insert(data).select().single(), "createInspection") as Inspection;
  }
  async getInspection(id: string) {
    return this.check(await this.db.from("inspections").select().eq("id", id).maybeSingle(), "getInspection") as Inspection | null;
  }
  async listInspections(limit = 100) {
    return this.check(
      await this.db.from("inspections").select().order("created_at", { ascending: false }).limit(limit),
      "listInspections",
    ) as Inspection[];
  }
  async updateInspection(id: string, patch: Partial<Inspection>) {
    this.check(await this.db.from("inspections").update(patch).eq("id", id), "updateInspection");
  }

  async createTestCases(cases: Parameters<Repository["createTestCases"]>[0]) {
    if (cases.length === 0) return [];
    return this.check(await this.db.from("test_cases").insert(cases).select(), "createTestCases") as TestCase[];
  }
  async listTestCases(inspectionId: string) {
    return this.check(
      await this.db.from("test_cases").select().eq("inspection_id", inspectionId).order("position"),
      "listTestCases",
    ) as TestCase[];
  }
  async listTestCasesForInspections(ids: string[]) {
    if (ids.length === 0) return [];
    return this.check(
      await this.db.from("test_cases").select().in("inspection_id", ids),
      "listTestCasesForInspections",
    ) as TestCase[];
  }
  async updateTestCase(id: string, patch: Partial<TestCase>) {
    this.check(await this.db.from("test_cases").update(patch).eq("id", id), "updateTestCase");
  }

  async createRun(run: Parameters<Repository["createRun"]>[0]) {
    return this.check(await this.db.from("verification_runs").insert(run).select().single(), "createRun") as VerificationRun;
  }
  async getRun(id: string) {
    return this.check(await this.db.from("verification_runs").select().eq("id", id).maybeSingle(), "getRun") as VerificationRun | null;
  }
  async listRuns(inspectionId: string) {
    return this.check(
      await this.db.from("verification_runs").select().eq("inspection_id", inspectionId).order("sequence"),
      "listRuns",
    ) as VerificationRun[];
  }
  async listRecentRuns(limit: number) {
    return this.check(
      await this.db.from("verification_runs").select().order("created_at", { ascending: false }).limit(limit),
      "listRecentRuns",
    ) as VerificationRun[];
  }
  async updateRun(id: string, patch: Partial<VerificationRun>) {
    this.check(await this.db.from("verification_runs").update(patch).eq("id", id), "updateRun");
  }
  async transitionRun(id: string, from: VerificationRun["status"][], patch: Partial<VerificationRun> & { status: VerificationRun["status"] }) {
    const rows = this.check(
      await this.db.from("verification_runs").update(patch).eq("id", id).in("status", from).select("id"),
      "transitionRun",
    ) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async upsertResult(input: Parameters<Repository["upsertResult"]>[0]) {
    let result: Record<string, unknown> = input;
    if (!(await this.evidenceSupported())) {
      result = omit(input, "evidence", "expected_outcome");
    }
    return this.check(
      await this.db
        .from("test_results")
        .upsert(result, { onConflict: "verification_run_id,test_case_id" })
        .select()
        .single(),
      "upsertResult",
    ) as TestResult;
  }
  async listResultsForRun(runId: string) {
    return this.check(await this.db.from("test_results").select().eq("verification_run_id", runId), "listResultsForRun") as TestResult[];
  }
  async listResultsForCases(ids: string[]) {
    if (ids.length === 0) return [];
    return this.check(await this.db.from("test_results").select().in("test_case_id", ids), "listResultsForCases") as TestResult[];
  }

  async upsertAnalysis(input: Parameters<Repository["upsertAnalysis"]>[0]) {
    let analysis: Record<string, unknown> = input;
    if (!(await this.evidenceSupported())) {
      analysis = omit(input, "bug_report");
    }
    return this.check(
      await this.db.from("ai_analyses").upsert(analysis, { onConflict: "test_result_id" }).select().single(),
      "upsertAnalysis",
    ) as AiAnalysis;
  }
  async listAnalyses(ids: string[]) {
    if (ids.length === 0) return [];
    return this.check(await this.db.from("ai_analyses").select().in("test_result_id", ids), "listAnalyses") as AiAnalysis[];
  }

  async getStats(): Promise<DashboardStats> {
    const count = async (build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const res = await build();
      if (res.error) throw new Error(`Supabase stats failed: ${res.error.message}`);
      return res.count ?? 0;
    };
    const [totalInspections, totalTestsExecuted, testsPassed, issuesDetected] = await Promise.all([
      count(() => this.db.from("inspections").select("id", { count: "exact", head: true })),
      count(() =>
        this.db
          .from("test_results")
          .select("id", { count: "exact", head: true })
          .in("execution_status", ["PASSED", "FAILED", "INCONCLUSIVE", "TIMEOUT"]),
      ),
      count(() => this.db.from("test_results").select("id", { count: "exact", head: true }).eq("execution_status", "PASSED")),
      count(() => this.db.from("test_results").select("id", { count: "exact", head: true }).eq("execution_status", "FAILED")),
    ]);
    return { totalInspections, totalTestsExecuted, testsPassed, issuesDetected };
  }

  async upsertArtifact(a: Parameters<Repository["upsertArtifact"]>[0]) {
    return this.check(
      await this.db.from("evidence_artifacts").upsert(a, { onConflict: "test_result_id,kind" }).select().single(),
      "upsertArtifact",
    ) as EvidenceArtifact;
  }
  async getArtifact(id: string) {
    return this.check(await this.db.from("evidence_artifacts").select().eq("id", id).maybeSingle(), "getArtifact") as EvidenceArtifact | null;
  }
  async listArtifactsForInspection(inspectionId: string) {
    if (!(await this.evidenceSupported())) return [];
    return this.check(await this.db.from("evidence_artifacts").select().eq("inspection_id", inspectionId), "listArtifacts") as EvidenceArtifact[];
  }
  async upsertFixVerification(v: Parameters<Repository["upsertFixVerification"]>[0]) {
    return this.check(
      await this.db.from("fix_verifications").upsert(v, { onConflict: "original_result_id,retest_result_id" }).select().single(),
      "upsertFixVerification",
    ) as FixVerification;
  }
  async listFixVerifications(inspectionId: string) {
    if (!(await this.evidenceSupported())) return [];
    return this.check(await this.db.from("fix_verifications").select().eq("inspection_id", inspectionId), "listFixVerifications") as FixVerification[];
  }

  /** Server-side access to the private evidence bucket. */
  get storage() {
    return this.db.storage;
  }

  async getDemoSettings(): Promise<DemoSettings> {
    const row = this.check(
      await this.db.from("demo_settings").select("mode, updated_at").eq("id", "default").maybeSingle(),
      "getDemoSettings",
    ) as DemoSettings | null;
    return row ?? { mode: "broken", updated_at: new Date(0).toISOString() };
  }
  async setDemoMode(mode: DemoSettings["mode"]) {
    return this.check(
      await this.db
        .from("demo_settings")
        .upsert({ id: "default", mode, updated_at: new Date().toISOString() })
        .select("mode, updated_at")
        .single(),
      "setDemoMode",
    ) as DemoSettings;
  }
}
