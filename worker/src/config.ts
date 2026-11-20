import { parseAllowlist } from "./url-safety.js";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  port: num(process.env.PORT, 8787),
  secret: process.env.KANE_WORKER_SECRET?.trim() || "",
  /** CECH app base URL for result callbacks. If unset, CECH polls GET /jobs/:id. */
  appUrl: process.env.CECH_APP_URL?.trim().replace(/\/+$/, "") || null,
  kaneBin: process.env.KANE_CLI_BIN?.trim() || "kane-cli",
  headless: process.env.KANE_HEADLESS !== "false",
  maxSteps: num(process.env.KANE_MAX_STEPS, 30),
  testTimeoutSec: num(process.env.KANE_TEST_TIMEOUT_SEC, 180),
  jobTimeoutSec: num(process.env.KANE_JOB_TIMEOUT_SEC, 1500),
  concurrency: num(process.env.KANE_MAX_CONCURRENCY, 2),
  maxQueuedJobs: num(process.env.KANE_MAX_QUEUED_JOBS, 20),
  ssrfAllowlist: parseAllowlist(process.env.SSRF_ALLOWLIST),
  ltUsername: process.env.LT_USERNAME?.trim() || null,
  ltAccessKey: process.env.LT_ACCESS_KEY?.trim() || null,
};

export function assertConfig() {
  if (!config.secret || config.secret.length < 16) {
    throw new Error("KANE_WORKER_SECRET must be set (min 16 chars). Refusing to start an unauthenticated worker.");
  }
}
