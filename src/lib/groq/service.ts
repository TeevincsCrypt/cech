import "server-only";
import type { SiteProbe } from "@/lib/server/site-probe";
import { describeProbe } from "@/lib/server/site-probe";
import type {
  AiAnalysis,
  ExecutionStatus,
  InspectionSummary,
  TestCase,
  TestCategory,
  TestResult,
} from "@/lib/types";
import { baselinePlan } from "./baseline";
import { callStructured, GroqUnavailableError } from "./client";
import {
  analystSystemPrompt,
  plannerSystemPrompt,
  plannerUserPrompt,
  retestSystemPrompt,
  summarySystemPrompt,
} from "./prompts";
import {
  AnalysisJsonSchema,
  AnalysisSchema,
  RetestPlanJsonSchema,
  RetestPlanSchema,
  SummaryJsonSchema,
  SummarySchema,
  TestPlanJsonSchema,
  TestPlanSchema,
  type AnalysisOutput,
  type PlannedTest,
} from "./schemas";

export { GroqUnavailableError } from "./client";

export const MAX_TESTS = 8;
const MAX_OBJECTIVE = 900;

/** Normalise an objective into a safe single-line instruction anchored to the start URL. */
export function sanitizeObjective(objective: string, url: string): string {
  let o = objective.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!/^go to /i.test(o)) o = `Go to ${url} and ${o.charAt(0).toLowerCase()}${o.slice(1)}`;
  return o.slice(0, MAX_OBJECTIVE);
}

function normalizePlan(tests: PlannedTest[], url: string, categories: TestCategory[]): PlannedTest[] {
  const seen = new Set<string>();
  const out: PlannedTest[] = [];
  for (const t of tests) {
    if (!categories.includes(t.category)) continue;
    let key = t.key.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) || `${t.category}-${out.length + 1}`;
    while (seen.has(key)) key = `${key}-x`;
    seen.add(key);
    out.push({ ...t, key, objective: sanitizeObjective(t.objective, url) });
    if (out.length >= MAX_TESTS) break;
  }
  return out;
}

// ---------------------------------------------------------------- 1. Planner
export async function generateTestPlan(input: {
  url: string;
  categories: TestCategory[];
  instructions: string | null;
  probe: SiteProbe;
}): Promise<{ tests: PlannedTest[]; source: "groq" | "baseline"; notes: string; model: string | null }> {
  const maxTests = Math.min(MAX_TESTS, Math.max(3, input.categories.length * 2));
  try {
    const { data, model } = await callStructured({
      name: "test_plan",
      jsonSchema: TestPlanJsonSchema,
      schema: TestPlanSchema,
      maxTokens: 3000,
      messages: [
        { role: "system", content: plannerSystemPrompt() },
        {
          role: "user",
          content: plannerUserPrompt({
            url: input.url,
            categories: input.categories,
            instructions: input.instructions,
            structure: describeProbe(input.probe),
            maxTests,
          }),
        },
      ],
    });
    const tests = normalizePlan(data.tests, input.url, input.categories);
    if (tests.length === 0) throw new GroqUnavailableError("Groq produced no usable tests.", "invalid_output");
    return { tests, source: "groq", notes: data.notes, model };
  } catch (err) {
    if (!(err instanceof GroqUnavailableError)) throw err;
    console.warn(`[groq] planner unavailable (${err.reason}): ${err.message} — using baseline objectives`);
    const fb = baselinePlan(input.url, input.categories, input.probe);
    return {
      tests: normalizePlan(fb.tests, input.url, input.categories),
      source: "baseline",
      notes: `${fb.notes} (Reason: ${err.message})`,
      model: null,
    };
  }
}

// ---------------------------------------------------------------- 2. Analyst
type AnalysisRecord = Omit<AiAnalysis, "id" | "created_at" | "test_result_id">;

function tail(s: string | null, n: number): string {
  if (!s) return "(empty)";
  return s.length > n ? `…${s.slice(-n)}` : s;
}

/** Infrastructure errors have no website evidence; explain them without AI. */
export function systemAnalysisForError(result: TestResult): AnalysisRecord {
  const kind = result.error_kind ?? "unknown";
  const explanations: Record<string, string> = {
    auth: "Kane CLI is not authenticated with TestMu AI on the worker, so the browser never opened. This is a CECH infrastructure problem, not a website defect.",
    browser: "The browser could not be started on the worker. This is an infrastructure problem, not a website defect.",
    network: "The worker could not reach the website or Kane's services. The site may be down or blocking automated access; this does not prove a website defect.",
    worker: "The Kane worker failed to execute this test. This is an infrastructure problem, not a website defect.",
    url_rejected: "The worker's SSRF protection rejected the URL, so the test was not executed.",
    no_verdict: "Kane exited without reporting a verdict, so no conclusion can be drawn about the website.",
    unknown: "The execution failed before Kane produced a verdict. No conclusion can be drawn about the website.",
  };
  return {
    source: "system",
    summary: explanations[kind] ?? explanations.unknown,
    issue_detected: null,
    severity: null,
    title: "Not executed — infrastructure error",
    description: tail(result.stderr, 600),
    expected_behavior: null,
    observed_behavior: null,
    recommendation:
      kind === "auth"
        ? "Configure LT_USERNAME and LT_ACCESS_KEY on the Kane worker (or run `kane-cli login` there), then retest."
        : "Check the worker logs and the raw output below, then retest.",
    confidence: null,
    model: null,
  };
}

export async function analyzeTestResult(input: {
  url: string;
  test: Pick<TestCase, "category" | "title" | "priority" | "expected_outcome">;
  result: TestResult;
}): Promise<AnalysisRecord> {
  const { result, test } = input;
  if (result.execution_status === "ERROR") return systemAnalysisForError(result);

  const steps = result.steps
    .filter((s) => s.status !== "running")
    .slice(-25)
    .map((s) => `  step ${s.step} [${s.status}]: ${s.remark}`)
    .join("\n");

  const payload = `Website: ${input.url}
Category: ${test.category}
Test title: ${test.title}
Priority: ${test.priority}
Objective executed by Kane: ${result.objective}
Expected outcome (from the plan): ${test.expected_outcome}

BROWSER OUTCOME (ground truth from Kane CLI): ${result.execution_status}
Kane exit code: ${result.exit_code ?? "n/a"}
Duration: ${result.duration_ms != null ? `${Math.round(result.duration_ms / 1000)}s` : "n/a"}
Evidence reference: ${result.evidence_reference ?? "none"}

<kane_output untrusted="true">
Kane summary: ${result.kane_summary ?? "(none)"}
Kane termination reason: ${result.kane_reason ?? "(none)"}
Steps:
${steps || "  (no step events)"}
stderr tail: ${tail(result.stderr, 800)}
</kane_output>`;

  try {
    const { data, model } = await callStructured({
      name: "test_analysis",
      jsonSchema: AnalysisJsonSchema,
      schema: AnalysisSchema,
      maxTokens: 1200,
      messages: [
        { role: "system", content: analystSystemPrompt() },
        { role: "user", content: payload },
      ],
    });
    return normalizeAnalysis(data, result.execution_status, model);
  } catch (err) {
    if (!(err instanceof GroqUnavailableError)) throw err;
    return {
      source: "unavailable",
      summary: `AI analysis unavailable: ${err.message} The browser outcome above is Kane's real result.`,
      issue_detected: null,
      severity: null,
      title: null,
      description: null,
      expected_behavior: test.expected_outcome,
      observed_behavior: result.kane_summary ?? result.kane_reason,
      recommendation: null,
      confidence: null,
      model: null,
    };
  }
}

/** Keep AI output consistent with (never overriding) the Kane outcome. */
export function normalizeAnalysis(data: AnalysisOutput, status: ExecutionStatus, model: string | null): AnalysisRecord {
  const passed = status === "PASSED";
  return {
    source: "groq",
    summary: data.summary,
    issue_detected: passed ? false : data.issue_detected,
    severity: passed ? "none" : data.severity,
    title: data.title,
    description: data.description || null,
    expected_behavior: data.expected_behavior || null,
    observed_behavior: data.observed_behavior || null,
    recommendation: data.recommendation || null,
    // A failed run with no issue identified, or non-conclusive outcomes, cap confidence.
    confidence: status === "TIMEOUT" || status === "INCONCLUSIVE" ? (data.confidence === "high" ? "medium" : data.confidence) : data.confidence,
    model,
  };
}

// ---------------------------------------------------------------- 3. Retest planner
export async function generateRetestPlan(input: {
  url: string;
  items: Array<{ test: TestCase; result: TestResult | null; analysis: AiAnalysis | null }>;
}): Promise<{ objectives: Map<string, { objective: string; rationale: string }>; source: "groq" | "baseline" }> {
  const fallback = () =>
    new Map(input.items.map((i) => [i.test.id, { objective: i.result?.objective ?? i.test.objective, rationale: "Original objective re-run unchanged." }]));

  const described = input.items
    .map(({ test, result, analysis }) => {
      const steps = (result?.steps ?? [])
        .filter((s) => s.status !== "running")
        .slice(-12)
        .map((s) => `    step ${s.step} [${s.status}]: ${s.remark}`)
        .join("\n");
      return `- test_case_id: ${test.id}
  title: ${test.title}
  expected_outcome: ${test.expected_outcome}
  previous_objective: ${result?.objective ?? test.objective}
  previous_browser_outcome: ${result?.execution_status ?? "NOT_EXECUTED"}
  <previous_kane_output untrusted="true">
  kane_summary: ${result?.kane_summary ?? "(none)"}
  kane_reason: ${result?.kane_reason ?? "(none)"}
${steps}
  </previous_kane_output>
  analysis: ${analysis ? `${analysis.summary} Observed: ${analysis.observed_behavior ?? "-"}` : "(none)"}`;
    })
    .join("\n\n");

  try {
    const { data } = await callStructured({
      name: "retest_plan",
      jsonSchema: RetestPlanJsonSchema,
      schema: RetestPlanSchema,
      maxTokens: 2500,
      messages: [
        { role: "system", content: retestSystemPrompt() },
        { role: "user", content: `Start URL: ${input.url}\n\nTests to retest:\n\n${described}` },
      ],
    });
    const map = fallback();
    for (const t of data.tests) {
      if (map.has(t.test_case_id)) {
        map.set(t.test_case_id, { objective: sanitizeObjective(t.objective, input.url), rationale: t.rationale });
      }
    }
    return { objectives: map, source: "groq" };
  } catch (err) {
    if (!(err instanceof GroqUnavailableError)) throw err;
    console.warn(`[groq] retest planner unavailable: ${err.message} — re-running previous objectives`);
    return { objectives: fallback(), source: "baseline" };
  }
}

// ---------------------------------------------------------------- 4. Summary
export async function generateInspectionSummary(input: {
  url: string;
  tests: Array<{ test: TestCase; result: TestResult | null; analysis: AiAnalysis | null }>;
  healthScore: number | null;
}): Promise<InspectionSummary> {
  const counts = { PASSED: 0, FAILED: 0, INCONCLUSIVE: 0, TIMEOUT: 0, ERROR: 0, NOT_EXECUTED: 0 } as Record<string, number>;
  for (const t of input.tests) counts[t.result?.execution_status ?? "NOT_EXECUTED"]++;

  const fallback = (reason: string): InspectionSummary => ({
    headline: `${counts.PASSED} passed, ${counts.FAILED} failed, ${counts.INCONCLUSIVE + counts.TIMEOUT} inconclusive, ${counts.ERROR} not executed (infrastructure).`,
    overview: `Summary generated without AI (${reason}). See each test for Kane's real browser outcome.`,
    key_issues: input.tests
      .filter((t) => t.result?.execution_status === "FAILED")
      .map((t) => `${t.test.title}${t.analysis?.title ? ` — ${t.analysis.title}` : ""}`),
    next_steps: counts.FAILED > 0 ? ["Apply fixes for the failed checks, then use “Retest failed tests”."] : [],
    source: "unavailable",
  });

  const lines = input.tests
    .map(
      ({ test, result, analysis }) =>
        `- [${result?.execution_status ?? "NOT_EXECUTED"}] (${test.priority}) ${test.title}${
          analysis?.source === "groq" ? ` — ${analysis.summary}${analysis.recommendation ? ` Recommendation: ${analysis.recommendation}` : ""}` : ""
        }`,
    )
    .join("\n");

  try {
    const { data } = await callStructured({
      name: "inspection_summary",
      jsonSchema: SummaryJsonSchema,
      schema: SummarySchema,
      maxTokens: 1200,
      messages: [
        { role: "system", content: summarySystemPrompt() },
        {
          role: "user",
          content: `Website: ${input.url}\nHealth score: ${input.healthScore ?? "insufficient data"}\nCounts: ${JSON.stringify(counts)}\n\nTests:\n${lines}`,
        },
      ],
    });
    return { ...data, source: "groq" };
  } catch (err) {
    if (!(err instanceof GroqUnavailableError)) throw err;
    return fallback(err.message);
  }
}
