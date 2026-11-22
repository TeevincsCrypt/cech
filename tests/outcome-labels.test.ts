import { describe, expect, it } from "vitest";
import { nonConclusiveBreakdown } from "@/lib/outcome-labels";

describe("nonConclusiveBreakdown", () => {
  it("groups non-conclusive outcomes by cause, most frequent first, with advice", () => {
    const b = nonConclusiveBreakdown([
      { execution_status: "TIMEOUT", error_kind: "timeout" },
      { execution_status: "TIMEOUT", error_kind: null },
      { execution_status: "INCONCLUSIVE", error_kind: "blocked_by_site" },
      { execution_status: "PASSED", error_kind: null },
      { execution_status: "FAILED", error_kind: null },
      null,
    ]);
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ["Timed out", 2],
      ["Site blocked automation", 1],
      ["Not executed", 1],
    ]);
    expect(b[0].advice).toMatch(/KANE_TEST_TIMEOUT_SEC/);
  });

  it("is empty when every test reached a verdict", () => {
    expect(nonConclusiveBreakdown([{ execution_status: "PASSED", error_kind: null }])).toEqual([]);
  });
});
