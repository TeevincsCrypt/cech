/**
 * Kane CLI agent-mode (--agent) output parser.
 *
 * Grounded in kane-cli 0.10.7 as installed and observed:
 *  - stdout is NDJSON, one event per line.
 *  - Typed events: {"type":"stream_start",...}, {"type":"recording_state",...},
 *    {"type":"error","message":...}, {"type":"bifurcation",...},
 *    {"type":"run_end","status":"passed"|"failed","summary","one_liner",
 *     "reason","duration","final_state","session_dir","test_url",...}
 *  - Untyped progress events: {"step":N,"status":"running"|"done"|"failed"|"passed","remark":...}
 *  - Worker-side timeouts: kane synthesises run_end{status:"failed",
 *    reason:"Timeout: Ns exceeded"} and exits 3.
 *  - OBSERVED: when not authenticated, kane prints
 *    "Not authenticated. Run: kane-cli login ..." to stderr, emits NO run_end,
 *    and exits 1 (the docs say 2). Therefore exit code alone never decides
 *    PASSED/FAILED — a verdict requires a run_end event.
 *
 * Execution status rules (never inferred from AI):
 *   PASSED        run_end.status=passed and exit code 0
 *   FAILED        run_end.status=failed (not timeout, not site access block)
 *   TIMEOUT       worker killed the run, exit 3, or run_end reason "Timeout:"
 *   INCONCLUSIVE  run_end present but ambiguous (unknown status, exit-code
 *                 mismatch, site blocked automation e.g. captcha/login wall)
 *   ERROR         no run_end: auth / browser / network / worker failure
 */

export type ExecutionStatus = "PASSED" | "FAILED" | "ERROR" | "TIMEOUT" | "INCONCLUSIVE";
export type ErrorKind =
  | "auth"
  | "browser"
  | "network"
  | "worker"
  | "url_rejected"
  | "timeout"
  | "no_verdict"
  | "blocked_by_site"
  | "unknown";

export interface KaneStep {
  step: number;
  status: string;
  remark: string;
}

export interface KaneRunEnd {
  type: "run_end";
  status?: string;
  summary?: string;
  one_liner?: string;
  reason?: string;
  duration?: number;
  session_dir?: string;
  run_dir?: string;
  test_url?: string;
  [key: string]: unknown;
}

export interface ParsedKaneOutput {
  status: ExecutionStatus;
  errorKind: ErrorKind | null;
  steps: KaneStep[];
  runEnd: KaneRunEnd | null;
  errors: string[];
  summary: string | null;
  reason: string | null;
  testUrl: string | null;
  evidenceReference: string | null;
  cliVersion: string | null;
  unparsedLines: number;
}

export interface ParseInput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** True when the worker killed the process for exceeding its time budget. */
  killedForTimeout?: boolean;
  /** Error raised while spawning (e.g. ENOENT when kane-cli is missing). */
  spawnError?: string | null;
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
export const stripAnsi = (s: string) => s.replace(ANSI, "");

const SITE_BLOCK =
  /captcha|recaptcha|hcaptcha|bot (protection|detection)|cloudflare|access denied|403 forbidden|requires? (login|sign[- ]?in|authentication)|login wall|paywall|blocked by the (site|website)/i;
const AUTH = /not authenticated|kane-cli login|unauthori[sz]ed|invalid (credentials|access key)|token (is )?(missing|expired|invalid)|401\b/i;
const BROWSER = /chrome is required|cdp endpoint|failed to (launch|start) (chrome|browser)|browser (crashed|closed unexpectedly)|remote-debugging/i;
const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network error|socket hang up|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i;
const TIMEOUT_REASON = /^timeout\b|timed out|exceeded/i;

/** Parse one NDJSON line; returns null for non-JSON lines. */
export function parseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const obj = JSON.parse(trimmed);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Merge a progress event into the ordered step list (latest status wins). */
export function applyStep(steps: KaneStep[], evt: Record<string, unknown>): boolean {
  if (typeof evt.type === "string" || typeof evt.step !== "number") return false;
  const step: KaneStep = {
    step: evt.step,
    status: typeof evt.status === "string" ? evt.status : "unknown",
    remark: typeof evt.remark === "string" ? evt.remark.slice(0, 500) : "",
  };
  const idx = steps.findIndex((s) => s.step === step.step);
  if (idx >= 0) steps[idx] = { ...step, remark: step.remark || steps[idx].remark };
  else steps.push(step);
  return true;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseKaneOutput(input: ParseInput): ParsedKaneOutput {
  const steps: KaneStep[] = [];
  const errors: string[] = [];
  let runEnd: KaneRunEnd | null = null;
  let cliVersion: string | null = null;
  let evidencePath: string | null = null;
  let unparsedLines = 0;

  for (const line of input.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const evt = parseLine(line);
    if (!evt) {
      unparsedLines++;
      continue;
    }
    if (applyStep(steps, evt)) continue;
    switch (evt.type) {
      case "run_end":
        runEnd = evt as KaneRunEnd;
        break;
      case "error":
        if (str(evt.message)) errors.push(str(evt.message)!);
        break;
      case "stream_start":
        cliVersion = str(evt.cli_version) ?? cliVersion;
        break;
      default:
        // Any typed event that names an evidence pack location.
        evidencePath = str(evt.evidence_path) ?? str((evt.evidence as Record<string, unknown> | undefined)?.path) ?? evidencePath;
    }
  }

  const stderr = stripAnsi(input.stderr);
  const summary = runEnd ? (str(runEnd.summary) ?? str(runEnd.one_liner)) : null;
  const reason = runEnd ? str(runEnd.reason) : (errors[0] ?? null);
  const testUrl = runEnd ? str(runEnd.test_url) : null;
  const evidenceReference =
    testUrl ??
    str(runEnd?.evidence_path) ??
    evidencePath ??
    (runEnd && str(runEnd.session_dir) ? `worker:${str(runEnd.session_dir)}` : null);

  const base = { steps, runEnd, errors, summary, reason, testUrl, evidenceReference, cliVersion, unparsedLines };

  if (input.spawnError) {
    return { ...base, status: "ERROR", errorKind: "worker", reason: input.spawnError };
  }
  if (input.killedForTimeout) {
    return { ...base, status: "TIMEOUT", errorKind: "timeout", reason: reason ?? "Worker per-test time limit exceeded" };
  }

  if (runEnd) {
    const st = (str(runEnd.status) ?? "").toLowerCase();
    if (input.exitCode === 3 || (st !== "passed" && reason && /^timeout\b/i.test(reason))) {
      return { ...base, status: "TIMEOUT", errorKind: "timeout" };
    }
    if (st === "passed") {
      return input.exitCode === 0
        ? { ...base, status: "PASSED", errorKind: null }
        : { ...base, status: "INCONCLUSIVE", errorKind: "no_verdict", reason: `run_end reported passed but exit code was ${input.exitCode}` };
    }
    if (st === "failed") {
      const text = `${reason ?? ""} ${summary ?? ""}`;
      if (SITE_BLOCK.test(text)) return { ...base, status: "INCONCLUSIVE", errorKind: "blocked_by_site" };
      return { ...base, status: "FAILED", errorKind: null };
    }
    return { ...base, status: "INCONCLUSIVE", errorKind: "no_verdict" };
  }

  // No verdict from Kane: classify the infrastructure failure. Never FAILED.
  if (input.exitCode === 3) return { ...base, status: "TIMEOUT", errorKind: "timeout" };
  const haystack = `${errors.join("\n")}\n${stderr}`;
  const errorKind: ErrorKind = AUTH.test(haystack)
    ? "auth"
    : BROWSER.test(haystack)
      ? "browser"
      : NETWORK.test(haystack)
        ? "network"
        : TIMEOUT_REASON.test(errors[0] ?? "")
          ? "timeout"
          : "no_verdict";
  const firstStderrLine = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
  return {
    ...base,
    status: errorKind === "timeout" ? "TIMEOUT" : "ERROR",
    errorKind,
    reason: reason ?? firstStderrLine ?? `kane-cli exited with code ${input.exitCode} without a verdict`,
  };
}
