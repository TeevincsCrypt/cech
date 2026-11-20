import { describe, expect, it } from "vitest";
import { computeHealthScore, computeOverallStatus } from "@/lib/scoring";

describe("computeHealthScore", () => {
  it("weights by priority over conclusive outcomes only", () => {
    const s = computeHealthScore([
      { priority: "high", status: "PASSED" }, // 3
      { priority: "high", status: "FAILED" }, // 3
      { priority: "low", status: "PASSED" }, // 1
      { priority: "medium", status: "ERROR" }, // excluded
    ]);
    expect(s.conclusiveWeight).toBe(7);
    expect(s.passedWeight).toBe(4);
    expect(s.score).toBe(57);
  });

  it("withholds the score with fewer than 2 conclusive tests", () => {
    const s = computeHealthScore([
      { priority: "high", status: "PASSED" },
      { priority: "high", status: "ERROR" },
    ]);
    expect(s.score).toBeNull();
    expect(s.reason).toMatch(/Only 1 test/);
  });

  it("withholds the score when most tests are inconclusive/errored", () => {
    const s = computeHealthScore([
      { priority: "high", status: "PASSED" },
      { priority: "high", status: "PASSED" },
      { priority: "high", status: "ERROR" },
      { priority: "high", status: "TIMEOUT" },
      { priority: "high", status: "INCONCLUSIVE" },
    ]);
    expect(s.score).toBeNull();
  });

  it("infrastructure errors never count as failures", () => {
    const s = computeHealthScore([
      { priority: "high", status: "PASSED" },
      { priority: "medium", status: "PASSED" },
      { priority: "medium", status: "ERROR" },
    ]);
    expect(s.score).toBe(100);
  });
});

describe("computeOverallStatus", () => {
  it("verified only after a retest confirms previously failed tests", () => {
    expect(computeOverallStatus(["PASSED", "PASSED"], true, true)).toBe("verified");
    expect(computeOverallStatus(["PASSED", "PASSED"], false, false)).toBe("passed");
    expect(computeOverallStatus(["PASSED", "FAILED"], true, true)).toBe("issues_found");
    expect(computeOverallStatus(["PASSED", "ERROR"], false, false)).toBe("incomplete");
  });
});
