import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseKaneOutput } from "../src/kane-parser";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseKaneOutput — real captured output (kane-cli 0.10.7)", () => {
  it("classifies the unauthenticated run as an infrastructure ERROR, never FAILED", () => {
    // Captured from: kane-cli run "..." --url https://example.com --agent --headless --timeout 60
    // Observed exit code was 1 (docs claim 2), with no run_end event.
    const out = parseKaneOutput({
      stdout: fixture("unauthenticated.stdout.ndjson"),
      stderr: fixture("unauthenticated.stderr.txt"),
      exitCode: 1,
    });
    expect(out.status).toBe("ERROR");
    expect(out.errorKind).toBe("auth");
    expect(out.runEnd).toBeNull();
    expect(out.cliVersion).toBe("0.10.7");
    expect(out.reason).toMatch(/Not authenticated/);
  });
});

describe("parseKaneOutput — documented agent-mode events", () => {
  const steps = [
    '{"step":1,"status":"running","remark":"Navigate to example.com"}',
    '{"step":1,"status":"done","remark":"Navigated to example.com"}',
    '{"step":2,"status":"running","remark":"Click Pricing"}',
  ];

  it("PASSED requires run_end.status=passed and exit 0", () => {
    const stdout = [
      ...steps,
      '{"step":2,"status":"done","remark":"Clicked Pricing"}',
      '{"type":"run_end","status":"passed","summary":"Reached pricing page","reason":"Objective completed","duration":12.3,"session_dir":"/root/.testmuai/kaneai/sessions/abc","test_url":"https://test-manager.lambdatest.com/x"}',
    ].join("\n");
    const out = parseKaneOutput({ stdout, stderr: "", exitCode: 0 });
    expect(out.status).toBe("PASSED");
    expect(out.steps).toHaveLength(2);
    expect(out.steps[1]).toMatchObject({ step: 2, status: "done", remark: "Clicked Pricing" });
    expect(out.evidenceReference).toBe("https://test-manager.lambdatest.com/x");
  });

  it("run_end passed with non-zero exit is INCONCLUSIVE", () => {
    const out = parseKaneOutput({ stdout: '{"type":"run_end","status":"passed"}', stderr: "", exitCode: 1 });
    expect(out.status).toBe("INCONCLUSIVE");
  });

  it("FAILED when Kane reports a failed objective", () => {
    const stdout = [
      ...steps,
      '{"step":2,"status":"failed","remark":"Page stayed on homepage after click"}',
      '{"type":"run_end","status":"failed","summary":"CTA did not navigate","reason":"Assertion failed: URL still /","session_dir":"/s/1"}',
    ].join("\n");
    const out = parseKaneOutput({ stdout, stderr: "", exitCode: 1 });
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("Assertion failed: URL still /");
    expect(out.evidenceReference).toBe("worker:/s/1");
  });

  it("Kane's synthesised timeout run_end is TIMEOUT, not FAILED", () => {
    const out = parseKaneOutput({
      stdout: '{"type":"run_end","status":"failed","run_id":"run-0","reason":"Timeout: 60s exceeded"}',
      stderr: "",
      exitCode: 3,
    });
    expect(out.status).toBe("TIMEOUT");
  });

  it("worker hard-kill is TIMEOUT", () => {
    const out = parseKaneOutput({ stdout: steps.join("\n"), stderr: "", exitCode: null, killedForTimeout: true });
    expect(out.status).toBe("TIMEOUT");
    expect(out.steps).toHaveLength(2);
  });

  it("site access walls are INCONCLUSIVE, not website failures", () => {
    const out = parseKaneOutput({
      stdout: '{"type":"run_end","status":"failed","reason":"Blocked by CAPTCHA challenge"}',
      stderr: "",
      exitCode: 1,
    });
    expect(out.status).toBe("INCONCLUSIVE");
    expect(out.errorKind).toBe("blocked_by_site");
  });

  it("chrome launch failure without run_end is ERROR/browser", () => {
    const out = parseKaneOutput({ stdout: "", stderr: "Error: CDP endpoint not reachable on port 9222", exitCode: 2 });
    expect(out).toMatchObject({ status: "ERROR", errorKind: "browser" });
  });

  it("typed error event without run_end is ERROR", () => {
    const out = parseKaneOutput({ stdout: '{"type":"error","message":"getaddrinfo ENOTFOUND foo.test"}', stderr: "", exitCode: 2 });
    expect(out).toMatchObject({ status: "ERROR", errorKind: "network" });
  });

  it("missing binary is ERROR/worker", () => {
    const out = parseKaneOutput({ stdout: "", stderr: "", exitCode: null, spawnError: "spawn kane-cli ENOENT" });
    expect(out).toMatchObject({ status: "ERROR", errorKind: "worker" });
  });

  it("ignores non-JSON lines and ANSI noise", () => {
    const out = parseKaneOutput({
      stdout: 'garbage line\n\u001b[32mnot json\u001b[0m\n{"type":"run_end","status":"passed"}',
      stderr: "",
      exitCode: 0,
    });
    expect(out.status).toBe("PASSED");
    expect(out.unparsedLines).toBe(2);
  });
});
