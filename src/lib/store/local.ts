import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AiAnalysis,
  DemoSettings,
  Inspection,
  TestCase,
  TestResult,
  VerificationRun,
} from "@/lib/types";
import type { DashboardStats, Repository } from "./types";

interface Db {
  inspections: Inspection[];
  test_cases: TestCase[];
  verification_runs: VerificationRun[];
  test_results: TestResult[];
  ai_analyses: AiAnalysis[];
  demo_settings: DemoSettings;
}

const emptyDb = (): Db => ({
  inspections: [],
  test_cases: [],
  verification_runs: [],
  test_results: [],
  ai_analyses: [],
  demo_settings: { mode: "broken", updated_at: new Date().toISOString() },
});

const now = () => new Date().toISOString();

/**
 * JSON-file repository for local development without Supabase.
 * Every operation re-reads the file inside a process-wide lock and writes
 * atomically (tmp + rename), so concurrent route handlers stay consistent.
 */
export class LocalFileRepository implements Repository {
  readonly kind = "local-file" as const;
  private file: string;

  constructor(file: string) {
    this.file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
  }

  private get lock(): { chain: Promise<unknown> } {
    const g = globalThis as unknown as { __cechLocalLock?: { chain: Promise<unknown> } };
    g.__cechLocalLock ??= { chain: Promise.resolve() };
    return g.__cechLocalLock;
  }

  private async load(): Promise<Db> {
    try {
      const raw = await readFile(this.file, "utf8");
      return { ...emptyDb(), ...(JSON.parse(raw) as Partial<Db>) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
      throw err;
    }
  }

  private async save(db: Db): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, this.file);
  }

  private tx<T>(fn: (db: Db) => T | Promise<T>, write: boolean): Promise<T> {
    const run = async () => {
      const db = await this.load();
      const out = await fn(db);
      if (write) await this.save(db);
      return structuredClone(out);
    };
    const next = this.lock.chain.then(run, run);
    this.lock.chain = next.catch(() => undefined);
    return next;
  }

  createInspection(data: Parameters<Repository["createInspection"]>[0]) {
    return this.tx((db) => {
      const row: Inspection = { ...data, id: randomUUID(), created_at: now() };
      db.inspections.push(row);
      return row;
    }, true);
  }
  getInspection(id: string) {
    return this.tx((db) => db.inspections.find((i) => i.id === id) ?? null, false);
  }
  listInspections(limit = 100) {
    return this.tx(
      (db) => [...db.inspections].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit),
      false,
    );
  }
  updateInspection(id: string, patch: Partial<Inspection>) {
    return this.tx((db) => {
      const row = db.inspections.find((i) => i.id === id);
      if (row) Object.assign(row, patch, { id });
    }, true);
  }

  createTestCases(cases: Parameters<Repository["createTestCases"]>[0]) {
    return this.tx((db) => {
      const rows = cases.map((c) => ({ ...c, id: randomUUID(), created_at: now() }));
      db.test_cases.push(...rows);
      return rows;
    }, true);
  }
  listTestCases(inspectionId: string) {
    return this.tx(
      (db) => db.test_cases.filter((c) => c.inspection_id === inspectionId).sort((a, b) => a.position - b.position),
      false,
    );
  }
  listTestCasesForInspections(ids: string[]) {
    const set = new Set(ids);
    return this.tx((db) => db.test_cases.filter((c) => set.has(c.inspection_id)), false);
  }
  updateTestCase(id: string, patch: Partial<TestCase>) {
    return this.tx((db) => {
      const row = db.test_cases.find((c) => c.id === id);
      if (row) Object.assign(row, patch, { id });
    }, true);
  }

  createRun(run: Parameters<Repository["createRun"]>[0]) {
    return this.tx((db) => {
      const row: VerificationRun = { ...run, id: randomUUID(), created_at: now() };
      db.verification_runs.push(row);
      return row;
    }, true);
  }
  getRun(id: string) {
    return this.tx((db) => db.verification_runs.find((r) => r.id === id) ?? null, false);
  }
  listRuns(inspectionId: string) {
    return this.tx(
      (db) => db.verification_runs.filter((r) => r.inspection_id === inspectionId).sort((a, b) => a.sequence - b.sequence),
      false,
    );
  }
  listRecentRuns(limit: number) {
    return this.tx(
      (db) => [...db.verification_runs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit),
      false,
    );
  }
  updateRun(id: string, patch: Partial<VerificationRun>) {
    return this.tx((db) => {
      const row = db.verification_runs.find((r) => r.id === id);
      if (row) Object.assign(row, patch, { id });
    }, true);
  }
  transitionRun(id: string, from: VerificationRun["status"][], patch: Partial<VerificationRun> & { status: VerificationRun["status"] }) {
    return this.tx((db) => {
      const row = db.verification_runs.find((r) => r.id === id);
      if (!row || !from.includes(row.status)) return false;
      Object.assign(row, patch, { id });
      return true;
    }, true);
  }

  upsertResult(result: Parameters<Repository["upsertResult"]>[0]) {
    return this.tx((db) => {
      const existing = db.test_results.find(
        (r) => r.verification_run_id === result.verification_run_id && r.test_case_id === result.test_case_id,
      );
      if (existing) {
        Object.assign(existing, result);
        return existing;
      }
      const row: TestResult = { ...result, id: randomUUID(), created_at: now() };
      db.test_results.push(row);
      return row;
    }, true);
  }
  listResultsForRun(runId: string) {
    return this.tx((db) => db.test_results.filter((r) => r.verification_run_id === runId), false);
  }
  listResultsForCases(ids: string[]) {
    const set = new Set(ids);
    return this.tx((db) => db.test_results.filter((r) => set.has(r.test_case_id)), false);
  }

  upsertAnalysis(analysis: Parameters<Repository["upsertAnalysis"]>[0]) {
    return this.tx((db) => {
      const existing = db.ai_analyses.find((a) => a.test_result_id === analysis.test_result_id);
      if (existing) {
        Object.assign(existing, analysis);
        return existing;
      }
      const row: AiAnalysis = { ...analysis, id: randomUUID(), created_at: now() };
      db.ai_analyses.push(row);
      return row;
    }, true);
  }
  listAnalyses(ids: string[]) {
    const set = new Set(ids);
    return this.tx((db) => db.ai_analyses.filter((a) => set.has(a.test_result_id)), false);
  }

  getStats() {
    return this.tx((db): DashboardStats => {
      const executed = db.test_results.filter((r) => ["PASSED", "FAILED", "INCONCLUSIVE", "TIMEOUT"].includes(r.execution_status));
      return {
        totalInspections: db.inspections.length,
        totalTestsExecuted: executed.length,
        testsPassed: executed.filter((r) => r.execution_status === "PASSED").length,
        issuesDetected: executed.filter((r) => r.execution_status === "FAILED").length,
      };
    }, false);
  }

  getDemoSettings() {
    return this.tx((db) => db.demo_settings, false);
  }
  setDemoMode(mode: DemoSettings["mode"]) {
    return this.tx((db) => {
      db.demo_settings = { mode, updated_at: now() };
      return db.demo_settings;
    }, true);
  }
}
