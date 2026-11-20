import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { OverallBadge } from "@/components/app/status-badge";
import type { InspectionListItem } from "@/lib/server/read-models";
import { formatDate, hostOf } from "@/lib/utils";

export function InspectionsTable({ items, showRuns, compact }: { items: InspectionListItem[]; showRuns?: boolean; compact?: boolean }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={`w-full text-sm ${compact ? "min-w-[560px]" : "min-w-[720px]"}`}>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
            <th className="px-5 py-3 font-medium">Website</th>
            {!compact && <th className="px-3 py-3 font-medium">Inspection date</th>}
            <th className="px-3 py-3 text-right font-medium">{compact ? "Executed" : "Tests executed"}</th>
            <th className="px-3 py-3 text-right font-medium">Passed</th>
            <th className="px-3 py-3 text-right font-medium">Failed</th>
            {showRuns && <th className="px-3 py-3 text-right font-medium">Score</th>}
            {showRuns && <th className="px-3 py-3 text-right font-medium">Runs</th>}
            <th className="px-3 py-3 font-medium">{compact ? "Status" : "Overall status"}</th>
            <th className="px-5 py-3 text-right font-medium">Report</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
              <td className="max-w-[240px] px-5 py-3.5">
                <span className="block truncate font-medium">{hostOf(i.website_url)}</span>
                {compact && <span className="block text-xs text-subtle">{formatDate(i.created_at)}</span>}
              </td>
              {!compact && <td className="px-3 py-3.5 text-muted">{formatDate(i.created_at)}</td>}
              <td className="px-3 py-3.5 text-right tabular-nums">
                {i.executed}
                <span className="text-subtle">/{i.tests}</span>
              </td>
              <td className="px-3 py-3.5 text-right tabular-nums text-accent">{i.passed}</td>
              <td className={`px-3 py-3.5 text-right tabular-nums ${i.failed ? "text-danger" : "text-subtle"}`}>{i.failed}</td>
              {showRuns && <td className="px-3 py-3.5 text-right tabular-nums">{i.health_score ?? "—"}</td>}
              {showRuns && <td className="px-3 py-3.5 text-right tabular-nums text-muted">{i.runs}</td>}
              <td className="px-3 py-3.5">
                <OverallBadge status={i.overall_status} inspectionStatus={i.status} />
              </td>
              <td className="px-5 py-3.5 text-right">
                <Link href={`/inspections/${i.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
                  View <ArrowUpRight className="size-3.5" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
