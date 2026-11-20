import "server-only";
import Groq from "groq-sdk";
import type { z } from "zod";
import { config } from "@/lib/server/config";

export class GroqUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "rate_limited" | "timeout" | "api_error" | "invalid_output",
  ) {
    super(message);
    this.name = "GroqUnavailableError";
  }
}

type Message = { role: "system" | "user" | "assistant"; content: string };

let client: Groq | null = null;
function getClient(): Groq {
  if (!config.groq.apiKey) {
    throw new GroqUnavailableError("GROQ_API_KEY is not configured.", "not_configured");
  }
  client ??= new Groq({
    apiKey: config.groq.apiKey,
    timeout: config.groq.timeoutMs,
    maxRetries: 2, // SDK retries 429/5xx/timeouts with exponential backoff + Retry-After
  });
  return client;
}

/** Remember which models rejected strict json_schema so we don't retry it every call. */
const strictUnsupported = new Set<string>();

/** Extract the first JSON object from a model reply (handles ``` fences / stray prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^﻿/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new SyntaxError("No JSON object found in model output");
}

function describeZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

export interface StructuredCallOptions<T> {
  name: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/**
 * Calls Groq and returns schema-validated JSON.
 *  1. Strict json_schema response_format (falls back to json_object if the
 *     model rejects it).
 *  2. Robust JSON extraction + Zod validation.
 *  3. One repair round-trip with the validation errors if output is invalid.
 */
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<StructuredResult<T>> {
  const groq = getClient();
  const model = config.groq.model;
  let messages = [...opts.messages];

  for (let attempt = 0; attempt < 2; attempt++) {
    const useStrict = !strictUnsupported.has(model);
    let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>;
    const started = Date.now();
    try {
      completion = await groq.chat.completions.create({
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 2048,
        response_format: useStrict
          ? { type: "json_schema", json_schema: { name: opts.name, schema: opts.jsonSchema, strict: true } }
          : { type: "json_object" },
      });
    } catch (err) {
      if (err instanceof Groq.BadRequestError && useStrict && /response_format|json_schema|strict/i.test(err.message)) {
        console.warn(`[groq] model ${model} rejected strict json_schema; falling back to json_object`);
        strictUnsupported.add(model);
        attempt--; // does not count as a repair attempt
        continue;
      }
      throw toUnavailable(err);
    }

    const usage = completion.usage ?? null;
    console.info(
      JSON.stringify({
        evt: "groq_call",
        fn: opts.name,
        model,
        strict: useStrict,
        ms: Date.now() - started,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens,
      }),
    );

    const content = completion.choices[0]?.message?.content ?? "";
    let problem: string;
    try {
      const parsed = opts.schema.safeParse(extractJson(content));
      if (parsed.success) return { data: parsed.data, model, usage };
      problem = describeZodError(parsed.error);
    } catch (err) {
      problem = (err as Error).message;
    }
    console.warn(`[groq] ${opts.name} invalid output (attempt ${attempt + 1}): ${problem}`);
    messages = [
      ...opts.messages,
      { role: "assistant", content: content.slice(0, 6000) },
      {
        role: "user",
        content: `Your previous reply did not match the required JSON schema: ${problem}. Reply again with ONLY the corrected JSON object.`,
      },
    ];
  }
  throw new GroqUnavailableError(`Groq returned invalid JSON for ${opts.name}.`, "invalid_output");
}

function toUnavailable(err: unknown): GroqUnavailableError {
  if (err instanceof GroqUnavailableError) return err;
  if (err instanceof Groq.RateLimitError) {
    return new GroqUnavailableError("Groq rate limit reached. Please retry shortly.", "rate_limited");
  }
  if (err instanceof Groq.APIConnectionTimeoutError) {
    return new GroqUnavailableError("Groq request timed out.", "timeout");
  }
  if (err instanceof Groq.AuthenticationError) {
    return new GroqUnavailableError("Groq rejected the API key (check GROQ_API_KEY).", "api_error");
  }
  if (err instanceof Groq.APIError) {
    return new GroqUnavailableError(`Groq API error${err.status ? ` ${err.status}` : ""}: ${err.message}`, "api_error");
  }
  return new GroqUnavailableError(`Groq request failed: ${(err as Error)?.message ?? String(err)}`, "api_error");
}
