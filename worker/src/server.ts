import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_KINDS } from "./evidence.js";
import { timingSafeEqual } from "node:crypto";
import { sendCallback } from "./callback.js";
import { assertConfig, config } from "./config.js";
import { artifactDir, getJob, onJobEvent, stats, submitJob, type JobTest } from "./jobs.js";
import { runKaneCommand } from "./kane-runner.js";
import { assertPublicUrl } from "./url-safety.js";

assertConfig();

const MAX_BODY = 100_000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const kaneStatus = { version: null as string | null, authenticated: null as boolean | null, checkedAt: null as string | null, detail: "" };

async function refreshKaneStatus() {
  const v = await runKaneCommand(["--version"], 15_000);
  kaneStatus.version = v.code === 0 ? v.out.trim().split(/\s+/)[0] : null;
  const w = await runKaneCommand(["whoami"], 20_000);
  kaneStatus.authenticated = w.code === 0 && !/not logged in|token\s+missing/i.test(w.out);
  kaneStatus.detail = kaneStatus.version ? "" : `kane-cli not runnable: ${v.out.slice(0, 200)}`;
  kaneStatus.checkedAt = new Date().toISOString();
}

async function loginIfConfigured() {
  if (!config.ltUsername || !config.ltAccessKey) {
    console.warn("[worker] LT_USERNAME / LT_ACCESS_KEY not set; relying on an existing `kane-cli login` profile.");
    return;
  }
  // Credentials passed as discrete argv elements (no shell). Kane stores them in its profile.
  const res = await runKaneCommand(["login", "--username", config.ltUsername, "--access-key", config.ltAccessKey], 60_000);
  console.log(`[worker] kane-cli login exit=${res.code}`);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(config.secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function validateJob(body: unknown): { id: string; url: string; tests: JobTest[] } | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b.jobId !== "string" || !ID_RE.test(b.jobId)) return "Invalid jobId.";
  if (typeof b.url !== "string") return "Invalid url.";
  if (!Array.isArray(b.tests) || b.tests.length < 1 || b.tests.length > 12) return "tests must contain 1-12 items.";
  const tests: JobTest[] = [];
  for (const t of b.tests as unknown[]) {
    const o = t as Record<string, unknown>;
    if (typeof o?.testCaseId !== "string" || !ID_RE.test(o.testCaseId)) return "Invalid testCaseId.";
    if (typeof o.objective !== "string" || o.objective.trim().length < 10 || o.objective.length > 1000) {
      return "Each objective must be 10-1000 characters.";
    }
    // Strip control characters; the objective is passed as one argv element.
    tests.push({ testCaseId: o.testCaseId, objective: o.objective.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() });
  }
  return { id: b.jobId, url: b.url, tests };
}

onJobEvent(({ type, job, test }) => {
  void sendCallback(type, job, test);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://worker");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      if (!kaneStatus.checkedAt || Date.now() - Date.parse(kaneStatus.checkedAt) > 60_000) await refreshKaneStatus();
      return send(res, 200, {
        ok: true,
        service: "cech-kane-worker",
        kane: kaneStatus,
        headless: config.headless,
        evidence: config.evidence,
        callbacks: Boolean(config.appUrl),
        ...stats(),
      });
    }

    if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });

    if (req.method === "POST" && url.pathname === "/jobs") {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: "Invalid JSON body." });
      }
      const parsed = validateJob(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      const safe = await assertPublicUrl(parsed.url, { allowlist: config.ssrfAllowlist });
      if (!safe.ok) return send(res, 422, { error: safe.reason, code: "url_rejected" });
      try {
        const job = submitJob(parsed.id, safe.normalized, parsed.tests);
        return send(res, 202, { jobId: job.id, status: job.status, tests: job.tests.length });
      } catch (err) {
        return send(res, 503, { error: (err as Error).message });
      }
    }

    // Proof of Fix artifacts: pulled by CECH (authenticated) and stored privately there.
    const a = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{1,64})\/artifacts\/([A-Za-z0-9_-]{1,64})\/([a-z_]{1,32})$/);
    if (req.method === "GET" && a) {
      const [, jobId, testCaseId, kind] = a;
      const job = getJob(jobId);
      if (!job || !(ARTIFACT_KINDS as readonly string[]).includes(kind) || !job.tests.some((t) => t.testCaseId === testCaseId)) {
        return send(res, 404, { error: "Artifact not found" });
      }
      const dir = artifactDir(jobId, testCaseId);
      const file = path.resolve(dir, `${kind}.jpg`);
      if (!file.startsWith(path.resolve(config.artifactRoot) + path.sep)) return send(res, 404, { error: "Artifact not found" });
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": "image/jpeg", "content-length": body.length, "cache-control": "no-store" });
        return res.end(body);
      } catch {
        return send(res, 404, { error: "Artifact not found" });
      }
    }

    const m = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{1,64})$/);
    if (req.method === "GET" && m) {
      const job = getJob(m[1]);
      return job ? send(res, 200, job) : send(res, 404, { error: "Job not found" });
    }

    return send(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[worker] request error", err);
    return send(res, 500, { error: "Internal worker error" });
  }
});

// Artifacts from a previous process belong to jobs this process no longer knows.
await rm(config.artifactRoot, { recursive: true, force: true }).catch(() => {});
await loginIfConfigured();
await refreshKaneStatus();
console.log(`[worker] kane-cli ${kaneStatus.version ?? "NOT FOUND"} authenticated=${kaneStatus.authenticated}`);
server.listen(config.port, () => {
  console.log(
    `[worker] listening on :${config.port} concurrency=${config.concurrency} headless=${config.headless} callbacks=${config.appUrl ?? "off (poll mode)"}`,
  );
});
