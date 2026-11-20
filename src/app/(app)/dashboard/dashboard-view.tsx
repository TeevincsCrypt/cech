"use client";
import { ArrowRight, Bug, CheckCircle2, FlaskConical, Globe, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryFlower } from "@/components/app/category-flower";
import { HeatBar } from "@/components/app/heat-bar";
import { InspectionsTable } from "@/components/app/inspections-table";
import { PageHeader } from "@/components/app/page-header";
import { Segmented } from "@/components/app/segmented";
import { StatRow } from "@/components/app/stat-row";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/client/use-api";
import type { getDashboard } from "@/lib/server/read-models";
import { hostOf, timeAgo } from "@/lib/utils";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

const RUN_LABEL = { initial: "Inspection", retest_failed: "Retest of failed tests", retest_all: "Full retest" } as const;

export function DashboardView() {
  const { data, error, loading, reload } = useApi<Dashboard>("/api/dashboard", {
    pollMs: (d) => (d?.recent.some((r) => r.status !== "completed" && r.status !== "failed") ? 4000 : 20000),
  });
  const [filter, setFilter] = useState<"all" | "issues">("all");

  if (error && !data) {
    return (
      <>
        <PageHeader title="Website Overview" description="Monitor website quality and verify your latest changes." />
        <ErrorState message={error} onRetry={reload} />
      </>
    );
  }

  const s = data?.stats;
  const conclusive = s ? s.testsPassed + s.issuesDetected : 0;
  const passRate = s && conclusive ? Math.round((s.testsPassed / conclusive) * 100) : null;
  const recent = (data?.recent ?? []).filter((r) => filter === "all" || r.failed > 0 || r.overall_status === "incomplete");
  const q = data?.quality;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Website Overview" description="Monitor website quality and verify your latest changes." />

      {/* Hero: big number + heat bar */}
      <section className="grid items-end gap-8 pb-10 lg:grid-cols-[260px_1fr] lg:gap-14">
        <div>
          {loading && !data ? <Skeleton className="h-24 w-36" /> : <p className="text-[88px] font-medium leading-[0.9] tracking-[-0.04em] tabular-nums sm:text-[104px]">{s?.totalTestsExecuted ?? 0}</p>}
          <p className="mt-3 text-sm text-muted">real browser tests executed by Kane</p>
        </div>
        <div className="pb-2">
          <p className="mb-4 text-sm text-muted">
            {passRate == null ? (
              "No conclusive pass/fail verdicts yet"
            ) : (
              <>
                <span className="mr-1.5 text-[22px] font-semibold text-accent">{passRate}%</span> of conclusive browser checks passed
              </>
            )}
          </p>
          <HeatBar value={passRate} label={passRate != null ? `${s?.testsPassed} passed` : undefined} height={48} />
        </div>
      </section>

      <StatRow
        items={[
          { label: "Total inspections", value: s?.totalInspections ?? 0, tone: "neutral", icon: Globe, loading: loading && !data, hint: "stored in CECH" },
          { label: "Tests passed", value: s?.testsPassed ?? 0, tone: "green", icon: CheckCircle2, loading: loading && !data, hint: "Kane-verified" },
          { label: "Issues detected", value: s?.issuesDetected ?? 0, tone: "red", icon: Bug, loading: loading && !data, hint: "failed browser checks" },
          { label: "Fixes verified", value: q?.resolved ?? 0, tone: "green", icon: ShieldCheck, loading: loading && !data, hint: q?.recurring ? `${q.recurring} recurring` : "by retest" },
        ]}
      />

      <section className="grid gap-10 pt-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-0">
        {/* Recent inspections */}
        <div className="min-w-0 lg:pr-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Recent inspections</h2>
              <span className="text-sm text-muted sm:border-l sm:border-border sm:pl-4">
                <span className="font-semibold text-foreground">{data?.totalInspections ?? 0} total,</span> review their results
              </span>
            </div>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "issues", label: "Issues" },
              ]}
            />
          </div>
          <div className="mt-3">
            {loading && !data ? (
              <TableSkeleton />
            ) : recent.length > 0 ? (
              <InspectionsTable items={recent} />
            ) : data && data.recent.length > 0 ? (
              <p className="py-10 text-center text-sm text-muted">No recent inspections with open issues.</p>
            ) : (
              <EmptyState
                title="No inspections yet"
                description="Run your first inspection to see real browser verification results here."
                action={{ href: "/inspections/new", label: "Inspect your website" }}
              />
            )}
          </div>
          {data && data.recent.length > 0 && (
            <Link href="/inspections" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
              View all inspections <ArrowRight className="size-4" />
            </Link>
          )}
        </div>

        {/* Quality map */}
        <aside className="lg:border-l lg:border-border lg:pl-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Quality map</h2>
            <Link href="/inspections" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
              <SlidersHorizontal className="size-4" /> History
            </Link>
          </div>
          <div className="mt-6">
            <CategoryFlower
              metrics={[
                { label: "Navigation", value: q?.categories.navigation ?? null },
                { label: "Forms", value: q?.categories.forms ?? null },
                { label: "Fixes verified", value: q?.fixVerificationRate ?? null },
                { label: "Journeys", value: q?.categories.journey ?? null },
                { label: "Conclusive", value: q?.conclusiveRate ?? null },
                { label: "Interface", value: q?.categories.interface ?? null },
              ]}
              center={<ShieldCheck className="size-5 text-ink" strokeWidth={2.4} />}
            />
            <p className="mt-3 text-center text-xs leading-relaxed text-subtle">
              Pass rate per category from the latest Kane verdicts. “—” means no conclusive data yet.
            </p>
          </div>
        </aside>
      </section>

      {/* Activity */}
      <section className="mt-10 border-t border-border pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent activity</h2>
        </div>
        {loading && !data ? (
          <TableSkeleton rows={2} />
        ) : data && data.activity.length > 0 ? (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link href={`/inspections/${a.inspection_id}`} className="flex gap-3 rounded-2xl bg-surface-2 p-4 transition-colors hover:bg-surface-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface">
                    {a.kind === "initial" ? <FlaskConical className="size-4 text-muted" /> : <RotateCcw className="size-4 text-info" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {RUN_LABEL[a.kind]} · {hostOf(a.website_url)}
                    </span>
                    <span className="mt-0.5 block text-xs text-subtle">
                      {a.status === "completed" ? (
                        <>
                          <span className="text-accent">{a.passed} passed</span>
                          {a.failed > 0 && <span className="text-danger"> · {a.failed} failed</span>}
                          {a.inconclusive > 0 && <span className="text-warning"> · {a.inconclusive} inconclusive</span>}
                          {a.errored > 0 && <span> · {a.errored} not executed</span>}
                        </>
                      ) : (
                        <span className="text-info">{a.status === "failed" ? "failed to start" : `${a.tests} tests ${a.status}…`}</span>
                      )}{" "}
                      · {timeAgo(a.at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 flex flex-col items-start gap-4 rounded-3xl bg-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Is your latest deploy actually working?</p>
              <p className="mt-1 text-sm text-muted">Groq plans the checks. Kane runs them in a real browser.</p>
            </div>
            <Button asChild>
              <Link href="/inspections/new">
                Inspect your website <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
