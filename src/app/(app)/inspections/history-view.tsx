"use client";
import { ArrowDownRight, ArrowUpRight, History, Minus, RefreshCcw, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { InspectionsTable } from "@/components/app/inspections-table";
import { PageHeader } from "@/components/app/page-header";
import { OverallBadge } from "@/components/app/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { HeatBar } from "@/components/app/heat-bar";
import { SiteTile } from "@/components/app/site-tile";
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useApi } from "@/lib/client/use-api";
import type { InspectionListItem } from "@/lib/server/read-models";
import { hostOf, timeAgo } from "@/lib/utils";

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return <span className="text-xs text-subtle">—</span>;
  const d = cur - prev;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted"><Minus className="size-3" /> 0</span>;
  return d > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-accent"><ArrowUpRight className="size-3" />+{d}</span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs text-danger"><ArrowDownRight className="size-3" />{d}</span>
  );
}

export function HistoryView() {
  const { data, error, loading, reload } = useApi<{ inspections: InspectionListItem[] }>("/api/inspections", {
    pollMs: (d) => (d?.inspections.some((i) => i.status !== "completed" && i.status !== "failed") ? 4000 : null),
  });
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const items = useMemo(() => (data?.inspections ?? []).filter((i) => i.website_url.toLowerCase().includes(q.toLowerCase())), [data, q]);

  // Group by website to compare consecutive inspections of the same site.
  const sites = useMemo(() => {
    const map = new Map<string, InspectionListItem[]>();
    for (const i of items) {
      const key = hostOf(i.website_url);
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return [...map.entries()].map(([site, list]) => ({ site, list }));
  }, [items]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inspection History"
        description="Every inspection and verification run, with real outcomes stored."
        actions={
          <Tooltip content="Refresh">
            <IconButton onClick={reload} aria-label="Refresh">
              <RefreshCcw />
            </IconButton>
          </Tooltip>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton rows={6} />
      ) : data && data.inspections.length === 0 ? (
        <EmptyState icon={History} title="No inspections yet" description="Inspections you run appear here with their verification history." action={{ href: "/inspections/new", label: "Run your first inspection" }} />
      ) : (
        <>
          <div className="relative mb-8 max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input placeholder="Filter by website" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-11" />
          </div>

          {sites.length > 0 && (
            <div className="mb-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sites.map(({ site, list }) => {
                const [latest, prev] = list;
                return (
                  <div key={site} className="rounded-3xl bg-surface-2 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <SiteTile url={latest.website_url} score={latest.health_score} className="bg-surface" />
                      <div className="mr-auto min-w-0">
                        <p className="truncate text-[15px] font-semibold">{site}</p>
                        <p className="mt-0.5 text-xs text-subtle">
                          {list.length} inspection{list.length === 1 ? "" : "s"} · last {timeAgo(latest.created_at)}
                        </p>
                      </div>
                      <OverallBadge status={latest.overall_status} inspectionStatus={latest.status} />
                    </div>
                    <div className="mt-6 flex items-end justify-between">
                      <div>
                        <p className="text-[44px] font-medium leading-none tracking-tight tabular-nums">{latest.health_score ?? "—"}</p>
                        <p className="mt-1.5 text-xs text-subtle">latest health score</p>
                      </div>
                      <div className="text-right">
                        <Delta cur={latest.health_score} prev={prev?.health_score ?? null} />
                        <p className="mt-1 text-xs text-subtle">vs previous</p>
                      </div>
                    </div>
                    <HeatBar value={latest.health_score} height={10} className="mt-4" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {latest.resolved > 0 && <Badge tone="green">{latest.resolved} resolved</Badge>}
                      {latest.recurring > 0 && <Badge tone="red">{latest.recurring} recurring</Badge>}
                      {latest.failed > 0 && <Badge tone="red">{latest.failed} open</Badge>}
                      {latest.runs > 1 && <Badge tone="blue">{latest.runs} runs</Badge>}
                    </div>
                    <div className="mt-4 flex gap-3 text-xs">
                      <Link href={`/inspections/${latest.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
                        Open latest report
                      </Link>
                      {latest.status === "completed" && (latest.failed > 0 || latest.inconclusive > 0) && (
                        <Link href={`/inspections/${latest.id}`} className="text-muted hover:text-ink">
                          Retest previous objectives →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-9">
            <h2 className="text-xl font-semibold tracking-tight">All inspections</h2>
            <span className="text-sm text-muted sm:border-l sm:border-border sm:pl-4">Counts reflect the latest Kane outcome for each test</span>
          </div>
          <div className="mt-3">{items.length ? <InspectionsTable items={items} showRuns /> : <p className="py-8 text-sm text-muted">No inspections match “{q}”.</p>}</div>
        </>
      )}
    </div>
  );
}
