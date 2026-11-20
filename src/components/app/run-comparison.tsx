import { ArrowRight } from "lucide-react";
import { ExecutionBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import type { ExecutionStatus, InspectionReport } from "@/lib/types";

const RUN_LABEL = { initial: "Initial", retest_failed: "Retest · failed", retest_all: "Retest · all" } as const;

export function changeOf(statuses: Array<ExecutionStatus | null>): { label: string; tone: "green" | "red" | "yellow" | "grey" } | null {
  const seen = statuses.filter((s): s is ExecutionStatus => s != null && s !== "QUEUED" && s !== "RUNNING");
  if (seen.length < 2) return null;
  const prev = seen.at(-2)!;
  const cur = seen.at(-1)!;
  if (prev !== "PASSED" && cur === "PASSED") return prev === "FAILED" ? { label: "Resolved", tone: "green" } : { label: "Now passing", tone: "green" };
  if (prev === "PASSED" && cur === "FAILED") return { label: "Regressed", tone: "red" };
  if (prev === "FAILED" && cur === "FAILED") return { label: "Recurring", tone: "red" };
  if (prev === cur) return { label: "Unchanged", tone: "grey" };
  return { label: "Changed", tone: "yellow" };
}

/** Matrix of real Kane outcomes per test across verification runs. */
export function RunComparison({ report }: { report: InspectionReport }) {
  const { runs, tests } = report;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
            <th className="px-5 py-3 font-medium">Test</th>
            {runs.map((r) => (
              <th key={r.id} className="px-3 py-3 font-medium">
                Run {r.sequence}
                <span className="block text-[10px] normal-case tracking-normal text-subtle">{RUN_LABEL[r.run_type]}</span>
              </th>
            ))}
            <th className="px-5 py-3 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => {
            const statuses = runs.map((r) => t.results.find((x) => x.verification_run_id === r.id)?.execution_status ?? null);
            const change = changeOf(statuses);
            return (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="max-w-[260px] truncate px-5 py-3">{t.title}</td>
                {statuses.map((s, i) => (
                  <td key={runs[i].id} className="px-3 py-3">
                    {s ? <ExecutionBadge status={s} /> : <span className="flex items-center text-xs text-subtle"><ArrowRight className="mr-1 size-3" />not rerun</span>}
                  </td>
                ))}
                <td className="px-5 py-3">{change ? <Badge tone={change.tone}>{change.label}</Badge> : <span className="text-xs text-subtle">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
