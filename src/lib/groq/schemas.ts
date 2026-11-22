import { z } from "zod";
import { PRIORITIES, TEST_CATEGORIES } from "@/lib/types";

/**
 * Each AI output has a Zod schema (authoritative validation before anything is
 * saved) and a matching JSON Schema sent to Groq as a strict response_format.
 * Strict mode requires every property be listed in `required` and
 * `additionalProperties: false`, so optional values use "" instead of null.
 */

const str = (max: number) => z.string().trim().max(max);

// ---------- Test plan ----------
export const PlannedTestSchema = z.object({
  key: str(40).min(1),
  category: z.enum(TEST_CATEGORIES),
  title: str(120).min(3),
  objective: str(900).min(20),
  expected_outcome: str(400).min(5),
  priority: z.enum(PRIORITIES),
  assumption: str(300),
});
export const TestPlanSchema = z.object({
  website: str(2048),
  notes: str(600),
  tests: z.array(PlannedTestSchema).min(1).max(12),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type PlannedTest = z.infer<typeof PlannedTestSchema>;

export const TestPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["website", "notes", "tests"],
  properties: {
    website: { type: "string" },
    notes: { type: "string", description: "Planning notes and any assumptions about the site. Empty string if none." },
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "category", "title", "objective", "expected_outcome", "priority", "assumption"],
        properties: {
          key: { type: "string", description: "Stable id such as navigation-001" },
          category: { type: "string", enum: [...TEST_CATEGORIES] },
          title: { type: "string" },
          objective: { type: "string", description: "Single natural-language browser instruction for Kane CLI." },
          expected_outcome: { type: "string", description: "Observable result that means the test passed." },
          priority: { type: "string", enum: [...PRIORITIES] },
          assumption: { type: "string", description: "Assumption this test relies on, or empty string." },
        },
      },
    },
  },
} as const;

// ---------- Result analysis ----------
export const AnalysisSchema = z.object({
  summary: str(400).min(1),
  issue_detected: z.boolean(),
  severity: z.enum(["critical", "high", "medium", "low", "none"]),
  title: str(160).min(1),
  description: str(1200),
  expected_behavior: str(600),
  observed_behavior: str(800),
  recommendation: str(1000),
  confidence: z.enum(["high", "medium", "low"]),
});
export type AnalysisOutput = z.infer<typeof AnalysisSchema>;

export const AnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "issue_detected",
    "severity",
    "title",
    "description",
    "expected_behavior",
    "observed_behavior",
    "recommendation",
    "confidence",
  ],
  properties: {
    summary: { type: "string" },
    issue_detected: { type: "boolean" },
    severity: { type: "string", enum: ["critical", "high", "medium", "low", "none"] },
    title: { type: "string" },
    description: { type: "string" },
    expected_behavior: { type: "string" },
    observed_behavior: { type: "string" },
    recommendation: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

// ---------- Retest plan ----------
export const RetestPlanSchema = z.object({
  tests: z
    .array(
      z.object({
        test_case_id: str(64).min(1),
        objective: str(900).min(20),
        rationale: str(400),
      }),
    )
    .max(12),
});
export type RetestPlan = z.infer<typeof RetestPlanSchema>;

export const RetestPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tests"],
  properties: {
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["test_case_id", "objective", "rationale"],
        properties: {
          test_case_id: { type: "string" },
          objective: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

// ---------- Inspection summary ----------
export const SummarySchema = z.object({
  headline: str(200).min(1),
  overview: str(1200),
  key_issues: z.array(str(300)).max(8),
  next_steps: z.array(str(300)).max(8),
});
export type SummaryOutput = z.infer<typeof SummarySchema>;

export const SummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "overview", "key_issues", "next_steps"],
  properties: {
    headline: { type: "string" },
    overview: { type: "string" },
    key_issues: { type: "array", items: { type: "string" } },
    next_steps: { type: "array", items: { type: "string" } },
  },
} as const;

// ---------- Bug reproduction report (Proof of Fix) ----------
export const BugReportSchema = z.object({
  title: str(160).min(3),
  severity: z.enum(["critical", "high", "medium", "low"]),
  feature: str(120).min(1),
  description: str(800).min(1),
  expected_behavior: str(500).min(1),
  actual_behavior: str(600).min(1),
  steps_to_reproduce: z.array(str(300).min(1)).min(1).max(10),
  observed_facts: z.array(str(400).min(1)).max(10),
  evidence_refs: z.array(str(40)).max(20),
  hypothesis: str(800),
  recommendation: str(800).min(1),
  retest_objective: str(900).min(20),
  evidence_sufficient: z.boolean(),
});
export type BugReportOutput = z.infer<typeof BugReportSchema>;

export const BugReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "severity",
    "feature",
    "description",
    "expected_behavior",
    "actual_behavior",
    "steps_to_reproduce",
    "observed_facts",
    "evidence_refs",
    "hypothesis",
    "recommendation",
    "retest_objective",
    "evidence_sufficient",
  ],
  properties: {
    title: { type: "string" },
    severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
    feature: { type: "string", description: "Affected website feature, e.g. 'Primary navigation — Pricing link'." },
    description: { type: "string" },
    expected_behavior: { type: "string" },
    actual_behavior: { type: "string", description: "What Kane actually observed. Facts only." },
    steps_to_reproduce: { type: "array", items: { type: "string" } },
    observed_facts: { type: "array", items: { type: "string" }, description: "Facts taken directly from the evidence, each citing an evidence id in brackets." },
    evidence_refs: { type: "array", items: { type: "string" }, description: "Only ids from the provided evidence list." },
    hypothesis: { type: "string", description: "Possible cause, clearly framed as a hypothesis. Empty if evidence is insufficient." },
    recommendation: { type: "string" },
    retest_objective: { type: "string" },
    evidence_sufficient: { type: "boolean" },
  },
} as const;
