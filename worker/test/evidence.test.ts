import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromeArgs, chromePath, findEvidencePack, safeUrl, startEvidenceSession } from "../src/evidence";
import { buildKaneArgs } from "../src/kane-runner";

describe("evidence helpers", () => {
  it("launches Chrome with kane-cli's Linux flags and a free DevTools port", () => {
    const args = chromeArgs("/tmp/profile", true);
    expect(args).toContain("--remote-debugging-port=0");
    expect(args).toContain("--user-data-dir=/tmp/profile");
    expect(args).toContain("--window-size=1920,1080");
    expect(args).toContain("--headless=new");
    if (process.platform === "linux") expect(args).toEqual(expect.arrayContaining(["--no-sandbox", "--disable-dev-shm-usage"]));
    expect(chromeArgs("/tmp/p", false)).not.toContain("--headless=new");
  });

  it("strips credentials and long query strings from recorded URLs", () => {
    expect(safeUrl("https://user:secret@site.dev/a?x=1")).toBe("https://site.dev/a?x=1");
    expect(safeUrl(`https://site.dev/?q=${"a".repeat(300)}`).length).toBeLessThan(200);
  });

  it("hands Kane the evidence browser via --cdp-endpoint (and never a shell string)", () => {
    const cdp = buildKaneArgs({ objective: "Go to x; rm -rf / and verify", url: "https://site.dev", timeoutSec: 60, chromeProfile: "/tmp/p", cdpEndpoint: "http://127.0.0.1:9333" });
    expect(cdp).toEqual(expect.arrayContaining(["--cdp-endpoint", "http://127.0.0.1:9333", "--agent"]));
    expect(cdp).not.toContain("--chrome-profile");
    expect(cdp).not.toContain("--headless");
    expect(cdp[1]).toBe("Go to x; rm -rf / and verify"); // one argv element
    const own = buildKaneArgs({ objective: "o", url: "https://site.dev", timeoutSec: 60, chromeProfile: "/tmp/p" });
    expect(own).toEqual(expect.arrayContaining(["--chrome-profile", "/tmp/p"]));
    expect(own).not.toContain("--cdp-endpoint");
  });

  it("detects a sealed Kane evidence pack without exposing its path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pack-"));
    expect(findEvidencePack([dir])).toBeNull();
    mkdirSync(path.join(dir, "evidence"));
    writeFileSync(path.join(dir, "evidence", "exec-1.evidence"), "PK....");
    expect(findEvidencePack([dir, "/does/not/exist"])).toEqual({ sealed: true, bytes: 6 });
  });
});

// ----------------------------------------------------------------------------
// Real browser integration: a real Chrome, real pages, real CDP observation.
// A second CDP client performs the interactions in place of Kane (Kane needs
// TestMu AI credentials and cloud access that this test environment lacks).
// ----------------------------------------------------------------------------
const hasChrome = existsSync(chromePath());

describe.skipIf(!hasChrome)("EvidenceSession against a real browser", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><title>Home</title><nav><a id="pricing" href="/about">Pricing</a></nav>
          <h1>Home</h1><button id="cta" onclick="window.__plan.trial()">Start trial</button>
          <script>fetch('/api/contact-submit',{method:'POST'}).catch(()=>{})</script>`);
      } else if (req.url === "/about") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><title>About</title><h1>About us</h1>`);
      } else {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server?.close());

  it("captures real screenshots, URLs, console errors and failed requests from the shared session", { timeout: 90_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cech-artifacts-"));
    const session = await startEvidenceSession({ artifactDir: dir, headless: true });
    try {
      expect(session.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      // Kane checks <endpoint>/json/version before connecting; it must answer.
      const version = await fetch(`${session.cdpEndpoint}/json/version`).then((r) => r.json());
      expect(version.Browser).toBeTruthy();

      await session.captureBefore(`${base}/`);

      // Stand-in for Kane: a separate CDP client driving the same browser.
      const driver = await chromium.connectOverCDP(session.cdpEndpoint);
      const page = driver.contexts()[0].pages().find((p) => p.url().startsWith(base))!;
      await page.click("#cta"); // throws: window.__plan is undefined
      await page.waitForTimeout(300);
      session.captureFailure();
      await page.click("#pricing");
      await page.waitForURL(`${base}/about`);
      session.captureAfter();
      const ev = await session.finish("FAILED", [dir]);

      expect(ev.mode).toBe("cdp");
      expect(ev.url_before).toBe(`${base}/`);
      expect(ev.url_after).toBe(`${base}/about`);
      expect(ev.viewport?.width).toBeGreaterThan(0);
      expect(ev.console_errors.some((c) => /__plan|undefined/.test(c.text))).toBe(true);
      expect(ev.failed_requests.some((r) => r.url.endsWith("/api/contact-submit") && r.status === 404)).toBe(true);
      expect(ev.artifacts.map((a) => a.kind).sort()).toEqual(["after_fullpage", "after_viewport", "at_failure", "before"]);
      for (const a of ev.artifacts) {
        const bytes = readFileSync(path.join(dir, `${a.kind}.jpg`));
        expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // real JPEG
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
        expect(a.bytes).toBe(bytes.length);
      }
      expect(ev.artifacts.find((a) => a.kind === "after_viewport")?.page_url).toBe(`${base}/about`);
      await driver.close().catch(() => {});
    } finally {
      await session.close();
    }
  });

  it("records a capture failure without throwing when the page cannot load", { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cech-artifacts-"));
    const session = await startEvidenceSession({ artifactDir: dir, headless: true });
    try {
      await session.captureBefore("http://127.0.0.1:1/"); // nothing listens on port 1
      const ev = await session.finish("ERROR", []);
      expect(ev.capture_errors.some((e) => e.startsWith("before:"))).toBe(true);
      expect(ev.artifacts.find((a) => a.kind === "after_viewport")).toBeUndefined();
    } finally {
      await session.close();
    }
  });
});
