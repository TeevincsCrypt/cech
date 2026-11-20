import "server-only";
import { parseAllowlist } from "@/lib/security/url-safety";

/**
 * Server-only configuration. Never import this from a client component —
 * `server-only` makes that a build error, which keeps secrets out of bundles.
 */
export const config = {
  groq: {
    apiKey: process.env.GROQ_API_KEY?.trim() || null,
    model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 45_000),
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  },
  worker: {
    url: process.env.KANE_WORKER_URL?.trim().replace(/\/+$/, "") || null,
    secret: process.env.KANE_WORKER_SECRET?.trim() || null,
  },
  /** Public base URL of this app; the worker posts results back here. */
  appUrl: process.env.CECH_APP_URL?.trim().replace(/\/+$/, "") || null,
  /** Dev-only SSRF bypass, exact host:port pairs. */
  ssrfAllowlist: parseAllowlist(process.env.SSRF_ALLOWLIST),
  localDataFile: process.env.CECH_LOCAL_DATA_FILE || ".data/cech-db.json",
};

export function integrationStatus() {
  return {
    groq: Boolean(config.groq.apiKey),
    groqModel: config.groq.model,
    supabase: Boolean(config.supabase.url && config.supabase.serviceRoleKey),
    worker: Boolean(config.worker.url && config.worker.secret),
    storage: config.supabase.url && config.supabase.serviceRoleKey ? "supabase" : "local-file",
    ssrfAllowlist: config.ssrfAllowlist,
  } as const;
}
