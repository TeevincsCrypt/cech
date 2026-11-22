import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestResult } from "@/lib/types";

const create = vi.fn();
vi.mock("groq-sdk", () => {
  class APIError extends Error {
    status?: number;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Groq {
    static APIError = APIError;
    static BadRequestError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionTimeoutError = class extends APIError {};
    static AuthenticationError = class extends APIError {};
    chat = { completions: { create } };
  }
  return { default: Groq };
});
process.env.GROQ_API_KEY = "test-key";

const reply = (o: unknown) => ({ choices: [{ message: { content: typeof o === "string" ? o : JSON.stringify(o) } }], usage: {} });
const URL = "https://demo.example.com/";

const result = (over: Partial<TestResult> = {}): TestResult => ({
  id: "r1", test_case_id: "t1", verification_run_id: "run1",
  objective: `Go to ${URL} and click Pricing in the main navigation. Verify that the pricing page loads.`,
  objective_note: null, execution_status: "FAILED", error_kind: null, raw_output: null, stderr: null, exit_code: 1, duration_ms: 1000,
  evidence_reference: null, kane_summary: "Clicked Pricing; landed on /demo/about", kane_reason: "Assertion failed", kane_test_url: null,
  steps: [{ step: 1, status: "done", remark: "Opened homepage" }, { step: 2, status: "failed", remark: "URL is /demo/about, expected /pricing" }],
  started_at: null, completed_at: null, created_at: "x",
  evidence: {
    mode: "cdp", viewport: { width: 1920, height: 937, deviceScaleFactor: 1 }, url_before: `${URL}demo`, url_after: `${URL}demo/about`,
    console_errors: [{ text: "TypeError: plan is undefined", url: null, at: "x" }], failed_requests: [], capture_errors: [],
    started_at: null, completed_at: null, artifacts: [], kane_evidence_pack: null,
  },
  ...over,
});
const test = { category: "navigation" as const, title: "Pricing nav", priority: "high" as const, expected_outcome: "The pricing page loads" };
const artifacts = [{ kind: "at_failure" as const, page_url: `${URL}demo/about`, captured_at: "x" }];

const good = {
  title: "Pricing navigation goes to the About page",
  severity: "medium",
  feature: "Primary navigation — Pricing",
  description: "The Pricing item navigates to the wrong page.",
  expected_behavior: "Clicking Pricing opens /pricing.",
  actual_behavior: "The browser ended on /demo/about.",
  steps_to_reproduce: ["Open the website.", "Click Pricing in the main navigation.", "Observe the URL."],
  observed_facts: ["URL after the click was /demo/about [url:after]", "Kane step 2 failed [kane:steps]"],
  evidence_refs: ["url:after", "screenshot:at_failure", "kane:steps"],
  hypothesis: "Possible cause: the nav link's href points to /about.",
  recommendation: "Check the Pricing link href and the route configuration.",
  retest_objective: `Go to ${URL} and click Pricing in the main navigation. Verify that the pricing page loads.`,
  evidence_sufficient: true,
};

describe("generateBugReport", () => {
  beforeEach(() => create.mockReset());

  it("returns a validated, evidence-grounded report for a genuine failure", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockResolvedValueOnce(reply(good));
    const { report } = await generateBugReport({ url: URL, test, result: result(), evidence: result().evidence!, artifacts });
    expect(report?.evidence_refs).toEqual(["url:after", "screenshot:at_failure", "kane:steps"]);
    expect(report?.removed_claims).toEqual([]);
    expect(report?.evidence_sufficient).toBe(true);
    // Only real evidence ids were offered to the model.
    const prompt = create.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain("[console:1] Browser console error: TypeError: plan is undefined");
    expect(prompt).toContain("[screenshot:at_failure]");
    expect(prompt).not.toContain("[network:1]");
  });

  it("removes unsupported claims citing evidence that does not exist", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockResolvedValueOnce(
      reply({
        ...good,
        evidence_refs: ["url:after", "console:3", "screenshot:before"],
        observed_facts: ["URL after was /demo/about [url:after]", "A 500 error occurred [network:1]", "The server crashed"],
      }),
    );
    const { report } = await generateBugReport({ url: URL, test, result: result(), evidence: result().evidence!, artifacts });
    expect(report?.evidence_refs).toEqual(["url:after"]);
    expect(report?.observed_facts).toEqual(["URL after was /demo/about [url:after]"]);
    expect(report?.removed_claims).toHaveLength(4);
  });

  it("forces evidence_sufficient=false when there is no browser evidence", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockResolvedValueOnce(reply({ ...good, observed_facts: ["Kane said it failed [kane:summary]"], evidence_refs: ["kane:summary"] }));
    const bare = result({ steps: [], evidence: null });
    const { report } = await generateBugReport({ url: URL, test, result: bare, evidence: null, artifacts: [] });
    expect(report?.evidence_sufficient).toBe(false);
  });

  it("recovers from invalid JSON via the repair round-trip", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockResolvedValueOnce(reply("not json at all")).mockResolvedValueOnce(reply(good));
    const { report } = await generateBugReport({ url: URL, test, result: result(), evidence: result().evidence!, artifacts });
    expect(report?.title).toBe(good.title);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("returns no report (never a fabricated one) when fields stay missing", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    const { steps_to_reproduce: _omit, ...missing } = good;
    void _omit;
    create.mockResolvedValue(reply(missing));
    const out = await generateBugReport({ url: URL, test, result: result(), evidence: result().evidence!, artifacts });
    expect(out.report).toBeNull();
    expect(out.error).toMatch(/invalid JSON/);
  });

  it("handles rate limits and outages without inventing a report", async () => {
    const Groq = (await import("groq-sdk")).default as unknown as { RateLimitError: new (s: number, m: string) => Error; APIError: new (s: number | undefined, m: string) => Error };
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockRejectedValueOnce(new Groq.RateLimitError(429, "slow down"));
    expect((await generateBugReport({ url: URL, test, result: result(), evidence: null, artifacts })).error).toMatch(/rate limit/i);
    create.mockRejectedValueOnce(new Groq.APIError(503, "service unavailable"));
    const out = await generateBugReport({ url: URL, test, result: result(), evidence: null, artifacts });
    expect(out.report).toBeNull();
    expect(out.error).toMatch(/503/);
  });

  it("is never generated for non-failures (passes, timeouts, blocked, errors)", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    for (const s of ["PASSED", "TIMEOUT", "INCONCLUSIVE", "ERROR"] as const) {
      const out = await generateBugReport({ url: URL, test, result: result({ execution_status: s }), evidence: null, artifacts });
      expect(out.report).toBeNull();
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("re-anchors the retest objective to the same start URL", async () => {
    const { generateBugReport } = await import("@/lib/groq/service");
    create.mockResolvedValueOnce(reply({ ...good, retest_objective: "Click Pricing and verify that the pricing page loads." }));
    const { report } = await generateBugReport({ url: URL, test, result: result(), evidence: result().evidence!, artifacts });
    expect(report?.retest_objective.startsWith(`Go to ${URL} and`)).toBe(true);
  });
});
