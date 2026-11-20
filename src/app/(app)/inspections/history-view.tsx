"use client";
import { ArrowDownRight, ArrowUpRight, History, Minus, Plus, RefreshCcw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { InspectionsTable } from "@/components/app/inspections-table";
import { PageHeader } from "@/components/app/page-header";
import { OverallBadge } from "@/components/app/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [q, setQ] = useState("");

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
          <>
            <Button variant="secondary" onClick={reload}>
              <RefreshCcw /> Refresh
            </Button>
            <Button asChild>
              <Link href="/inspections/new">
                <Plus /> New inspection
              </Link>
            </Button>
          </>
        }
      />

      {error && !data ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : loading && !data ? (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      ) : data && data.inspections.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="No inspections yet" description="Inspections you run appear here with their verification history." action={{ href: "/inspections/new", label: "Run your first inspection" }} />
        </Card>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input placeholder="Filter by website" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
          </div>

          {sites.length > 0 && (
            <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sites.map(({ site, list }) => {
                const [latest, prev] = list;
                return (
                  <Card key={site} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{site}</p>
                        <p className="mt-0.5 text-xs text-subtle">
                          {list.length} inspection{list.length === 1 ? "" : "s"} · last {timeAgo(latest.created_at)}
                        </p>
                      </div>
                      <OverallBadge status={latest.overall_status} inspectionStatus={latest.status} />
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-subtle">Latest score</p>
                        <p className="text-2xl font-semibold tabular-nums">{latest.health_score ?? "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wider text-subtle">vs previous</p>
                        <Delta cur={latest.health_score} prev={prev?.health_score ?? null} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {latest.resolved > 0 && <Badge tone="green">{latest.resolved} resolved</Badge>}
                      {latest.recurring > 0 && <Badge tone="red">{latest.recurring} recurring</Badge>}
                      {latest.failed > 0 && <Badge tone="red">{latest.failed} open</Badge>}
                      {latest.runs > 1 && <Badge tone="blue">{latest.runs} runs</Badge>}
                    </div>
                    <div className="mt-4 flex gap-3 text-xs">
                      <Link href={`/inspections/${latest.id}`} className="text-accent hover:underline">
                        Open latest report
                      </Link>
                      {latest.status === "completed" && (latest.failed > 0 || latest.inconclusive > 0) && (
                        <Link href={`/inspections/${latest.id}`} className="text-muted hover:text-foreground">
                          Retest previous objectives →
                        </Link>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All inspections</CardTitle>
              <CardDescription>Counts reflect the latest Kane outcome for each test</CardDescription>
            </CardHeader>
            {items.length ? <InspectionsTable items={items} showRuns /> : <p className="px-5 pb-6 text-sm text-muted">No inspections match “{q}”.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
