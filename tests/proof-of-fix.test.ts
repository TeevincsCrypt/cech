import { describe, expect, it } from "vitest";
import { checkEquivalence, evaluateIssue, formatElapsed, startUrlOf, type ResultLike } from "@/lib/proof-of-fix";
import type { ExecutionStatus } from "@/lib/types";

const URL = "https://demo.example.com/";
const EXPECTED = "The pricing page loads";
const OBJ = `Go to ${URL} and click "Pricing" in the main navigation. Verify that the pricing page loads.`;
const FOCUSED = `Go to ${URL} and click the "Pricing" link in the header nav. Verify that the pricing page loads with its heading.`;
const test = { id: "t1", expected_outcome: EXPECTED };

let n = 0;
function r(status: ExecutionStatus, o: Partial<ResultLike> = {}): ResultLike {
  n++;
  return {
    id: `r${n}`,
    test_case_id: "t1",
    execution_status: status,
    objective: OBJ,
    expected_outcome: EXPECTED,
    completed_at: new Date(Date.UTC(2026, 10, 22, 10, n)).toISOString(),
    ...o,
  };
}

describe("evaluateIssue — verification rules", () => {
  it("original failure followed by a successful equivalent retest → VERIFIED with proof", () => {
    const f = r("FAILED");
    const p = r("PASSED", { objective: FOCUSED });
    const ev = evaluateIssue(test, [f, p]);
    expect(ev.state).toBe("verified");
    expect(ev.proof?.original.id).toBe(f.id);
    expect(ev.proof?.retest.id).toBe(p.id);
    expect(ev.proof?.equivalence).toBe("same_expected_outcome");
    expect(ev.proof?.elapsedMs).toBe(60_000);
  });

  it("exact replay is recorded as exact_objective equivalence", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("PASSED")]);
    expect(ev.proof?.equivalence).toBe("exact_objective");
  });

  it("original failure followed by another failure → recurring, never verified", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("FAILED")]);
    expect(ev.state).toBe("recurring");
    expect(ev.proof).toBeNull();
  });

  it("original failure followed by a timeout → still open, not verified", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("TIMEOUT")]);
    expect(ev.state).toBe("open");
    expect(ev.proof).toBeNull();
    expect(ev.note).toMatch(/timed out/);
  });

  it("original failure followed by blocked automation (inconclusive) → not verified", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("INCONCLUSIVE")]);
    expect(ev.state).toBe("open");
    expect(ev.proof).toBeNull();
  });

  it("infrastructure errors never count as a pass", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("ERROR")]);
    expect(ev.state).toBe("open");
  });

  it("a different test's result mistakenly submitted as the retest is ignored", () => {
    const other = r("PASSED", { test_case_id: "t2" });
    const ev = evaluateIssue(test, [r("FAILED"), other]);
    expect(ev.state).toBe("open");
    expect(ev.proof).toBeNull();
  });

  it("changed expected outcome → resolved but NOT verified", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("PASSED", { expected_outcome: "Some page loads" })]);
    expect(ev.state).toBe("resolved");
    expect(ev.proof).toBeNull();
    expect(ev.notVerifiedReason).toMatch(/expected outcome changed/i);
  });

  it("changed test objective start URL → resolved but NOT verified", () => {
    const ev = evaluateIssue(test, [r("FAILED"), r("PASSED", { objective: "Go to https://other.example.com/ and click Pricing. Verify that the pricing page loads." })]);
    expect(ev.state).toBe("resolved");
    expect(ev.notVerifiedReason).toMatch(/same URL/);
  });

  it("a previously verified issue that fails again → REGRESSED", () => {
    const later = r("FAILED");
    const ev = evaluateIssue(test, [r("FAILED"), r("PASSED"), later]);
    expect(ev.state).toBe("regressed");
    expect(ev.regressedBy?.id).toBe(later.id);
    expect(ev.proof).toBeNull();
  });

  it("missing evidence during the retest does not block or fake verification (outcomes decide)", () => {
    // Evidence is not part of ResultLike: verification depends only on real Kane outcomes.
    const ev = evaluateIssue(test, [r("FAILED"), r("PASSED")]);
    expect(ev.state).toBe("verified");
  });

  it("pairs the original failure with the FIRST pass after it", () => {
    const f = r("FAILED");
    const p1 = r("PASSED");
    r("TIMEOUT");
    const ev = evaluateIssue(test, [f, p1, r("PASSED")]);
    expect(ev.proof?.retest.id).toBe(p1.id);
  });

  it("legacy results without an expected-outcome snapshot use the test's expected outcome", () => {
    const ev = evaluateIssue(test, [r("FAILED", { expected_outcome: null }), r("PASSED", { expected_outcome: null })]);
    expect(ev.state).toBe("verified");
  });

  it("never failed → passing; no conclusive verdict → not_executed", () => {
    expect(evaluateIssue(test, [r("PASSED")]).state).toBe("passing");
    expect(evaluateIssue(test, [r("ERROR")]).state).toBe("not_executed");
    expect(evaluateIssue(test, []).state).toBe("not_executed");
  });
});

describe("helpers", () => {
  it("extracts and normalises the start URL", () => {
    expect(startUrlOf("Go to https://a.dev/x and click")).toBe("https://a.dev/x");
    expect(startUrlOf("Go to https://a.dev/, and click")).toBe("https://a.dev");
    expect(startUrlOf("Click the button")).toBeNull();
  });
  it("checkEquivalence rejects different tests", () => {
    const res = checkEquivalence(r("FAILED"), r("PASSED", { test_case_id: "zzz" }), EXPECTED);
    expect(res.ok).toBe(false);
  });
  it("formats elapsed time", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(3_725_000)).toBe("1h 2m");
    expect(formatElapsed(null)).toBe("—");
  });
});
