import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { applyStep, parseKaneOutput, parseLine, stripAnsi, type KaneStep, type ParsedKaneOutput } from "./kane-parser.js";

const MAX_STDOUT = 400_000;
const MAX_STDERR = 60_000;

export interface KaneRunOutcome extends ParsedKaneOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface RunOptions {
  objective: string;
  url: string;
  timeoutSec: number;
  signal?: AbortSignal;
  onSteps?: (steps: KaneStep[]) => void;
}

/** Build the exact argv for kane-cli. User/AI text is a single argv element — never a shell string. */
export function buildKaneArgs(opts: { objective: string; url: string; timeoutSec: number; chromeProfile: string }): string[] {
  const args = [
    "run",
    opts.objective,
    "--url",
    opts.url,
    "--agent",
    "--mode",
    "testing",
    "--timeout",
    String(opts.timeoutSec),
    "--max-steps",
    String(config.maxSteps),
    "--chrome-profile",
    opts.chromeProfile,
  ];
  if (config.headless) args.push("--headless");
  return args;
}

/** Run one Kane objective in a real browser. Resolves with the parsed real outcome. */
export async function runKane(opts: RunOptions): Promise<KaneRunOutcome> {
  const workdir = await mkdtemp(path.join(tmpdir(), "cech-kane-"));
  const chromeProfile = path.join(workdir, "chrome-profile");
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  let stdout = "";
  let stderr = "";
  let lineBuf = "";
  const steps: KaneStep[] = [];
  let killedForTimeout = false;
  let spawnError: string | null = null;

  const exitCode = await new Promise<number | null>((resolve) => {
    let child;
    try {
      child = spawn(config.kaneBin, buildKaneArgs({ ...opts, chromeProfile }), {
        cwd: workdir,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
        detached: process.platform !== "win32", // own process group so we can kill Chrome too
      });
    } catch (err) {
      spawnError = (err as Error).message;
      resolve(null);
      return;
    }

    const killTree = (sig: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        /* already gone */
      }
    };

    // Kane enforces --timeout itself; this is the hard backstop (+30s grace).
    const hardTimer = setTimeout(() => {
      killedForTimeout = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 5000).unref();
    }, (opts.timeoutSec + 30) * 1000);

    const onAbort = () => {
      killedForTimeout = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 5000).unref();
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    let lastEmit = 0;
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      if (stdout.length < MAX_STDOUT) stdout += chunk.slice(0, MAX_STDOUT - stdout.length);
      lineBuf += chunk;
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop() ?? "";
      let changed = false;
      for (const l of lines) {
        const evt = parseLine(l);
        if (evt && applyStep(steps, evt)) changed = true;
      }
      if (changed && opts.onSteps && Date.now() - lastEmit > 1200) {
        lastEmit = Date.now();
        opts.onSteps(steps.map((s) => ({ ...s })));
      }
    });
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > MAX_STDERR * 2) stderr = stderr.slice(-MAX_STDERR);
    });

    child.on("error", (err) => {
      spawnError = `Failed to start ${config.kaneBin}: ${err.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(hardTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(code);
    });
  });

  rm(workdir, { recursive: true, force: true }).catch(() => {});

  const cleanStderr = stripAnsi(stderr).slice(-MAX_STDERR);
  const parsed = parseKaneOutput({ stdout, stderr: cleanStderr, exitCode, killedForTimeout, spawnError });
  const completed = Date.now();
  return {
    ...parsed,
    stdout,
    stderr: cleanStderr,
    exitCode,
    durationMs: completed - started,
    startedAt,
    completedAt: new Date(completed).toISOString(),
  };
}

/** Run a short kane-cli command (version/whoami/login) safely. */
export function runKaneCommand(args: string[], timeoutMs = 30_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(config.kaneBin, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
    } catch (err) {
      resolve({ code: null, out: (err as Error).message });
      return;
    }
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (out += d));
    child.on("error", (e) => (out += e.message));
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, out: stripAnsi(out) });
    });
  });
}
