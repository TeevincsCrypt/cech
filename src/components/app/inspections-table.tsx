import { ArrowUpRight, CalendarDays, MoreVertical } from "lucide-react";
import Link from "next/link";
import { ProgressRing } from "@/components/app/progress-ring";
import { SiteTile } from "@/components/app/site-tile";
import { OverallBadge } from "@/components/app/status-badge";
import type { InspectionListItem } from "@/lib/server/read-models";
import { formatDate, formatDay, hostOf } from "@/lib/utils";

function passRate(i: InspectionListItem) {
  const conclusive = i.passed + i.failed;
  return conclusive ? Math.round((i.passed / conclusive) * 100) : null;
}

/** List rows in the style of the reference "Top learners" table. */
export function InspectionsTable({ items, showRuns }: { items: InspectionListItem[]; showRuns?: boolean; compact?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => {
        const rate = passRate(i);
        return (
          <li key={i.id}>
            <Link href={`/inspections/${i.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto]">
              <SiteTile url={i.website_url} score={i.health_score} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium group-hover:underline">{hostOf(i.website_url)}</p>
                <p className="mt-0.5 truncate text-xs text-subtle">
                  {i.executed}/{i.tests} tests executed{showRuns && ` · ${i.runs} run${i.runs === 1 ? "" : "s"}`}
                  {i.resolved > 0 && <span className="text-accent"> · {i.resolved} resolved</span>}
                  {i.recurring > 0 && <span className="text-danger"> · {i.recurring} recurring</span>}
                </p>
              </div>
              <div className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                <OverallBadge status={i.overall_status} inspectionStatus={i.status} />
              </div>
              <span className="hidden items-center gap-2 whitespace-nowrap text-sm text-foreground sm:flex" title={formatDate(i.created_at)}>
                <CalendarDays className="size-4 text-subtle" /> {formatDay(i.created_at)}
              </span>
              <span className="hidden items-center gap-2.5 text-sm tabular-nums sm:flex" title="Pass rate across conclusive Kane verdicts">
                <ProgressRing value={rate} color={rate != null && rate < 60 ? "var(--danger)" : rate != null && rate >= 85 ? "var(--accent)" : "var(--info)"} />
                {rate == null ? "—" : `${rate}%`}
              </span>
              <span className="flex size-8 items-center justify-center rounded-full text-subtle group-hover:bg-surface-2 group-hover:text-ink" aria-hidden>
                <MoreVertical className="size-4 group-hover:hidden" />
                <ArrowUpRight className="hidden size-4 group-hover:block" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
