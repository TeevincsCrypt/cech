import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Groq SDK so we can exercise CECH's recovery logic without network.
const create = vi.fn();
vi.mock("groq-sdk", () => {
  class APIError extends Error {
    status?: number;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  class BadRequestError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionTimeoutError extends APIError {}
  class AuthenticationError extends APIError {}
  class Groq {
    static APIError = APIError;
    static BadRequestError = BadRequestError;
    static RateLimitError = RateLimitError;
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    static AuthenticationError = AuthenticationError;
    chat = { completions: { create } };
  }
  return { default: Groq };
});

process.env.GROQ_API_KEY = "test-key";
process.env.GROQ_MODEL = "test-model";

const reply = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });

const validAnalysis = {
  summary: "CTA did not navigate",
  issue_detected: true,
  severity: "high",
  title: "Dead CTA",
  description: "d",
  expected_behavior: "Opens signup",
  observed_behavior: "Stayed on homepage",
  recommendation: "Check the click handler",
  confidence: "high",
};

describe("callStructured", () => {
  beforeEach(() => create.mockReset());

  it("uses strict json_schema and validates output", async () => {
    const { callStructured } = await import("@/lib/groq/client");
    const { AnalysisSchema, AnalysisJsonSchema } = await import("@/lib/groq/schemas");
    create.mockResolvedValueOnce(reply(JSON.stringify(validAnalysis)));
    const out = await callStructured({ name: "t", jsonSchema: AnalysisJsonSchema, schema: AnalysisSchema, messages: [{ role: "user", content: "x" }] });
    expect(out.data.title).toBe("Dead CTA");
    expect(create.mock.calls[0][0].response_format.type).toBe("json_schema");
    expect(create.mock.calls[0][0].response_format.json_schema.strict).toBe(true);
  });

  it("repairs invalid JSON with one follow-up call", async () => {
    const { callStructured } = await import("@/lib/groq/client");
    const { AnalysisSchema, AnalysisJsonSchema } = await import("@/lib/groq/schemas");
    create.mockResolvedValueOnce(reply('{"summary": "missing fields"}')).mockResolvedValueOnce(reply("```json\n" + JSON.stringify(validAnalysis) + "\n```"));
    const out = await callStructured({ name: "t", jsonSchema: AnalysisJsonSchema, schema: AnalysisSchema, messages: [{ role: "user", content: "x" }] });
    expect(out.data.severity).toBe("high");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages.at(-1).content).toMatch(/did not match the required JSON schema/);
  });

  it("falls back to json_object when the model rejects strict schemas", async () => {
    const Groq = (await import("groq-sdk")).default as unknown as { BadRequestError: new (s: number, m: string) => Error };
    const { callStructured } = await import("@/lib/groq/client");
    const { AnalysisSchema, AnalysisJsonSchema } = await import("@/lib/groq/schemas");
    create.mockRejectedValueOnce(new Groq.BadRequestError(400, "response_format json_schema is not supported")).mockResolvedValueOnce(reply(JSON.stringify(validAnalysis)));
    await callStructured({ name: "t", jsonSchema: AnalysisJsonSchema, schema: AnalysisSchema, messages: [{ role: "user", content: "x" }] });
    expect(create.mock.calls[1][0].response_format.type).toBe("json_object");
  });

  it("maps rate limits to GroqUnavailableError(rate_limited)", async () => {
    const Groq = (await import("groq-sdk")).default as unknown as { RateLimitError: new (s: number, m: string) => Error };
    const { callStructured, GroqUnavailableError } = await import("@/lib/groq/client");
    const { AnalysisSchema, AnalysisJsonSchema } = await import("@/lib/groq/schemas");
    create.mockRejectedValueOnce(new Groq.RateLimitError(429, "slow down"));
    const err = await callStructured({ name: "t", jsonSchema: AnalysisJsonSchema, schema: AnalysisSchema, messages: [{ role: "user", content: "x" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(GroqUnavailableError);
    expect(err.reason).toBe("rate_limited");
  });
});

describe("analysis normalisation", () => {
  it("never reports an issue for a PASSED Kane outcome", async () => {
    const { normalizeAnalysis } = await import("@/lib/groq/service");
    const out = normalizeAnalysis({ ...validAnalysis, severity: "high", issue_detected: true } as never, "PASSED", "m");
    expect(out.issue_detected).toBe(false);
    expect(out.severity).toBe("none");
  });

  it("caps confidence for non-conclusive outcomes", async () => {
    const { normalizeAnalysis } = await import("@/lib/groq/service");
    expect(normalizeAnalysis(validAnalysis as never, "TIMEOUT", "m").confidence).toBe("medium");
  });

  it("anchors objectives to the start URL and strips control characters", async () => {
    const { sanitizeObjective } = await import("@/lib/groq/service");
    expect(sanitizeObjective("Click Pricing\n\u0007and verify", "https://a.dev")).toBe("Go to https://a.dev and click Pricing and verify");
  });
});

describe("proportionate severity", () => {
  it("caps severity by test priority: cosmetic checks can't become major issues", async () => {
    const { capSeverity, normalizeAnalysis } = await import("@/lib/groq/service");
    expect(capSeverity("critical", "low")).toBe("medium");
    expect(capSeverity("high", "low")).toBe("medium");
    expect(capSeverity("low", "low")).toBe("low");
    expect(capSeverity("critical", "medium")).toBe("high");
    expect(capSeverity("critical", "high")).toBe("critical");
    // e.g. a low-priority "homepage has an <h1>" check rated critical by the model
    const out = normalizeAnalysis({ ...validAnalysis, severity: "critical" } as never, "FAILED", "m", "low");
    expect(out.severity).toBe("medium");
  });

  it("the fallback plan never treats the homepage heading check as high priority", async () => {
    const { baselinePlan } = await import("@/lib/groq/baseline");
    const probe = { ok: true, finalUrl: null, status: 200, title: null, headings: [], links: [], buttons: [], forms: [], error: null };
    const t = baselinePlan("https://a.dev/", ["interface"], probe).tests[0];
    expect(t.priority).not.toBe("high");
    expect(t.objective).not.toMatch(/main heading is visible/);
  });
});
