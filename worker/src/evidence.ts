/**
 * Proof of Fix — evidence capture from the REAL browser session Kane drives.
 *
 * The worker launches Chrome itself (same flags Kane uses on Linux), passes
 * `--cdp-endpoint` to kane-cli (a supported Kane mode: Kane connects and does
 * not own/kill the browser), and attaches its own CDP observer to the same
 * browser. Everything recorded here is what that browser actually reported:
 * screenshots, URLs, console errors and failed network requests.
 * Nothing is synthesised. Capture problems are recorded in capture_errors and
 * never change Kane's outcome.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export const ARTIFACT_KINDS = ["before", "at_failure", "after_viewport", "after_fullpage"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface ArtifactMeta {
  kind: ArtifactKind;
  content_type: "image/jpeg";
  bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  page_url: string | null;
  captured_at: string;
}

export interface ExecutionEvidence {
  mode: "cdp" | "none";
  viewport: { width: number; height: number; deviceScaleFactor: number } | null;
  url_before: string | null;
  url_after: string | null;
  console_errors: Array<{ text: string; url: string | null; at: string }>;
  failed_requests: Array<{ url: string; method: string; status: number | null; error: string | null; at: string }>;
  capture_errors: string[];
  started_at: string | null;
  completed_at: string | null;
  artifacts: ArtifactMeta[];
  kane_evidence_pack: { sealed: boolean; bytes: number | null } | null;
}

export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_FULLPAGE_HEIGHT = 8000;
const MAX_LOG_ENTRIES = 40;
const WINDOW = { width: 1920, height: 1080 }; // matches kane-cli's own default window

export function emptyEvidence(captureErrors: string[] = []): ExecutionEvidence {
  return {
    mode: "none",
    viewport: null,
    url_before: null,
    url_after: null,
    console_errors: [],
    failed_requests: [],
    capture_errors: captureErrors,
    started_at: null,
    completed_at: null,
    artifacts: [],
    kane_evidence_pack: null,
  };
}

export function chromePath(): string {
  return process.env.KANE_CLI_CHROME_PATH?.trim() || "/usr/bin/google-chrome";
}

/** Mirrors kane-cli's Linux launch flags. */
export function chromeArgs(userDataDir: string, headless: boolean): string[] {
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${WINDOW.width},${WINDOW.height}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-popup-blocking",
    "--disable-notifications",
    "--disable-background-networking",
    "--disable-default-apps",
    "--password-store=basic",
  ];
  if (process.platform === "linux") args.push("--no-sandbox", "--disable-dev-shm-usage");
  if (headless) args.push("--headless=new");
  args.push("about:blank");
  return args;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Strip credentials and long query strings from URLs before recording them. */
export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    if (u.search.length > 120) u.search = `${u.search.slice(0, 120)}…`;
    return clip(u.toString(), 400);
  } catch {
    return clip(raw, 400);
  }
}

async function waitForDevToolsPort(userDataDir: string, child: ChildProcess, timeoutMs = 20_000): Promise<number> {
  const file = path.join(userDataDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Chrome exited during startup (code ${child.exitCode})`);
    try {
      const [port] = (await readFile(file, "utf8")).split("\n");
      if (Number(port) > 0) return Number(port);
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Chrome did not expose a DevTools port in time");
}

export interface EvidenceSessionOptions {
  artifactDir: string;
  headless: boolean;
}

export class EvidenceSession {
  readonly evidence: ExecutionEvidence = { ...emptyEvidence(), mode: "cdp" };
  cdpEndpoint = "";
  private chrome: ChildProcess | null = null;
  private userDataDir = "";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  private pending: Array<Promise<void>> = [];
  private failureCaptured = false;
  private afterCaptured = false;

  constructor(private opts: EvidenceSessionOptions) {}

  async start(): Promise<void> {
    this.userDataDir = await mkdtemp(path.join(tmpdir(), "cech-chrome-"));
    this.chrome = spawn(chromePath(), chromeArgs(this.userDataDir, this.opts.headless), {
      stdio: "ignore",
      shell: false,
      detached: process.platform !== "win32",
    });
    this.chrome.on("error", () => {});
    const port = await waitForDevToolsPort(this.userDataDir, this.chrome);
    this.cdpEndpoint = `http://127.0.0.1:${port}`;
    this.browser = await chromium.connectOverCDP(this.cdpEndpoint, { timeout: 15_000 });
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
    for (const p of this.context.pages()) this.observe(p);
    this.context.on("page", (p) => this.observe(p));
  }

  private observe(page: Page) {
    const ev = this.evidence;
    const now = () => new Date().toISOString();
    page.on("console", (msg) => {
      if (msg.type() !== "error" || ev.console_errors.length >= MAX_LOG_ENTRIES) return;
      const loc = msg.location()?.url;
      ev.console_errors.push({ text: clip(msg.text(), 500), url: loc ? safeUrl(loc) : null, at: now() });
    });
    page.on("pageerror", (err) => {
      if (ev.console_errors.length >= MAX_LOG_ENTRIES) return;
      ev.console_errors.push({ text: clip(`Uncaught ${err.name}: ${err.message}`, 500), url: safeUrl(page.url()), at: now() });
    });
    page.on("requestfailed", (req) => {
      if (ev.failed_requests.length >= MAX_LOG_ENTRIES) return;
      ev.failed_requests.push({ url: safeUrl(req.url()), method: req.method(), status: null, error: clip(req.failure()?.errorText ?? "failed", 200), at: now() });
    });
    page.on("response", (res) => {
      if (res.status() < 400 || ev.failed_requests.length >= MAX_LOG_ENTRIES) return;
      ev.failed_requests.push({ url: safeUrl(res.url()), method: res.request().method(), status: res.status(), error: null, at: now() });
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) this.activePage = page;
    });
    this.activePage ??= page;
  }

  /** The page Kane most recently navigated (falls back to the last open page). */
  private currentPage(): Page | null {
    if (this.activePage && !this.activePage.isClosed()) return this.activePage;
    const open = this.context?.pages().filter((p) => !p.isClosed()) ?? [];
    return open.at(-1) ?? null;
  }

  private async shoot(kind: ArtifactKind, fullPage = false): Promise<void> {
    const page = this.currentPage();
    if (!page) {
      this.evidence.capture_errors.push(`${kind}: no open page to capture`);
      return;
    }
    try {
      const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, sh: document.documentElement.scrollHeight }));
      this.evidence.viewport ??= { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr };
      const tooTall = fullPage && vp.sh > MAX_FULLPAGE_HEIGHT;
      const shot = (quality: number) =>
        page.screenshot({
          type: "jpeg",
          quality,
          fullPage,
          timeout: 15_000,
          animations: "disabled",
          ...(tooTall ? { clip: { x: 0, y: 0, width: vp.w, height: MAX_FULLPAGE_HEIGHT } } : {}),
        });
      let buf = await shot(70);
      if (buf.length > MAX_ARTIFACT_BYTES) buf = await shot(40);
      if (buf.length > MAX_ARTIFACT_BYTES) {
        this.evidence.capture_errors.push(`${kind}: screenshot exceeded ${MAX_ARTIFACT_BYTES} bytes and was discarded`);
        return;
      }
      await mkdir(this.opts.artifactDir, { recursive: true });
      await writeFile(path.join(this.opts.artifactDir, `${kind}.jpg`), buf);
      this.evidence.artifacts = this.evidence.artifacts.filter((a) => a.kind !== kind);
      this.evidence.artifacts.push({
        kind,
        content_type: "image/jpeg",
        bytes: buf.length,
        width: vp.w,
        height: fullPage ? Math.min(vp.sh, MAX_FULLPAGE_HEIGHT) : vp.h,
        sha256: createHash("sha256").update(buf).digest("hex"),
        page_url: safeUrl(page.url()),
        captured_at: new Date().toISOString(),
      });
      if (tooTall) this.evidence.capture_errors.push(`${kind}: page taller than ${MAX_FULLPAGE_HEIGHT}px; captured the top ${MAX_FULLPAGE_HEIGHT}px`);
    } catch (err) {
      this.evidence.capture_errors.push(`${kind}: ${clip((err as Error).message.split("\n")[0], 200)}`);
    }
  }

  /** Load the start URL in the session and capture its state before Kane acts. */
  async captureBefore(url: string): Promise<void> {
    this.evidence.started_at = new Date().toISOString();
    const page = this.currentPage() ?? (await this.context!.newPage());
    this.activePage = page;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(600);
      this.evidence.url_before = safeUrl(page.url());
      await this.shoot("before");
    } catch (err) {
      this.evidence.capture_errors.push(`before: ${clip((err as Error).message.split("\n")[0], 200)}`);
    }
  }

  /** Called on Kane's first failed step event — captures the failure moment. */
  captureFailure(): void {
    if (this.failureCaptured) return;
    this.failureCaptured = true;
    this.pending.push(this.shoot("at_failure"));
  }

  /** Called as soon as Kane emits run_end (and again at exit if missed). */
  captureAfter(): void {
    if (this.afterCaptured) return;
    this.afterCaptured = true;
    this.pending.push(
      (async () => {
        await this.shoot("after_viewport");
        const page = this.currentPage();
        if (page) this.evidence.url_after = safeUrl(page.url());
      })(),
    );
  }

  /**
   * Finalise evidence for a completed Kane run.
   * @param status   Kane's real outcome (never modified here)
   * @param packDirs directories to look in for a sealed Kane evidence pack
   */
  async finish(status: string, packDirs: string[]): Promise<ExecutionEvidence> {
    if (status !== "ERROR") this.captureAfter();
    await Promise.allSettled(this.pending);
    if ((status === "PASSED" || status === "FAILED") && this.currentPage()) await this.shoot("after_fullpage", true);
    if (status === "ERROR") this.evidence.capture_errors.push("Kane did not execute this test (infrastructure error); no after-execution capture was taken.");
    this.evidence.kane_evidence_pack = findEvidencePack(packDirs);
    this.evidence.completed_at = new Date().toISOString();
    return this.evidence;
  }

  async close(): Promise<void> {
    try {
      await this.browser?.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.chrome?.pid && process.platform !== "win32") process.kill(-this.chrome.pid, "SIGKILL");
      else this.chrome?.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    if (this.userDataDir) await rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Look for a sealed Kane evidence pack (*.evidence). Records presence/size only — never paths. */
export function findEvidencePack(dirs: string[]): { sealed: boolean; bytes: number | null } | null {
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    const stack = [dir];
    let depth = 0;
    while (stack.length && depth < 200) {
      depth++;
      const d = stack.pop()!;
      let entries: string[] = [];
      try {
        entries = readdirSync(d);
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(d, e);
        try {
          const st = statSync(full);
          if (e.endsWith(".evidence") && st.isFile()) return { sealed: true, bytes: st.size };
          if (st.isDirectory() && !e.startsWith("chrome")) stack.push(full);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

export async function startEvidenceSession(opts: EvidenceSessionOptions): Promise<EvidenceSession> {
  const s = new EvidenceSession(opts);
  try {
    await s.start();
    return s;
  } catch (err) {
    await s.close();
    throw err;
  }
}
