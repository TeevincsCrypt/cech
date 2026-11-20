"use client";
import { Activity, ArrowRight, Bug, CheckCircle2, FlaskConical, Globe, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { InspectionsTable } from "@/components/app/inspections-table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { TrendChart } from "@/components/app/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/client/use-api";
import type { getDashboard } from "@/lib/server/read-models";
import { hostOf, timeAgo } from "@/lib/utils";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

const RUN_LABEL = { initial: "Inspection", retest_failed: "Retest of failed tests", retest_all: "Full retest" } as const;

export function DashboardView() {
  const { data, error, loading, reload } = useApi<Dashboard>("/api/dashboard", {
    pollMs: (d) => (d?.recent.some((r) => r.status !== "completed" && r.status !== "failed") ? 4000 : 20000),
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Website Overview"
        description="Monitor website quality and verify your latest changes."
        actions={
          <Button asChild>
            <Link href="/inspections/new">
              <Plus /> New inspection
            </Link>
          </Button>
        }
      />

      {error && !data ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total inspections" value={data?.stats.totalInspections ?? null} icon={Globe} loading={loading} />
            <StatCard label="Tests executed" value={data?.stats.totalTestsExecuted ?? null} icon={FlaskConical} loading={loading} hint="Real Kane browser runs" />
            <StatCard label="Tests passed" value={data?.stats.testsPassed ?? null} icon={CheckCircle2} tone="green" loading={loading} />
            <StatCard label="Issues detected" value={data?.stats.issuesDetected ?? null} icon={Bug} tone="red" loading={loading} hint="Failed browser checks" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent inspections</CardTitle>
                  <CardDescription>Latest Kane outcome for each test</CardDescription>
                </div>
                <Link href="/inspections" className="text-xs text-muted hover:text-foreground">
                  View all →
                </Link>
              </CardHeader>
              {loading && !data ? (
                <TableSkeleton />
              ) : data && data.recent.length > 0 ? (
                <InspectionsTable items={data.recent} compact />
              ) : (
                <EmptyState
                  title="No inspections yet"
                  description="Run your first inspection to see real browser verification results here."
                  action={{ href: "/inspections/new", label: "Inspect your website" }}
                />
              )}
            </Card>

            <div className="space-y-6">
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-grid opacity-60" aria-hidden />
                <CardContent className="relative p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent">Quick inspection</p>
                  <p className="mt-2 text-base font-semibold">Is your latest deploy actually working?</p>
                  <p className="mt-1 text-sm text-muted">Groq plans the checks. Kane runs them in a real browser.</p>
                  <Button asChild className="mt-4 w-full">
                    <Link href="/inspections/new">
                      Inspect your website <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {data && data.trend.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Health score trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendChart points={data.trend} />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="size-4 text-muted" /> Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading && !data ? (
                    <TableSkeleton rows={3} />
                  ) : data && data.activity.length > 0 ? (
                    <ul className="space-y-3">
                      {data.activity.slice(0, 7).map((a) => (
                        <li key={a.id}>
                          <Link href={`/inspections/${a.inspection_id}`} className="group flex gap-3">
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                              {a.kind === "initial" ? <FlaskConical className="size-3.5 text-muted" /> : <RotateCcw className="size-3.5 text-info" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm group-hover:text-accent">
                                {RUN_LABEL[a.kind]} · {hostOf(a.website_url)}
                              </span>
                              <span className="block text-xs text-subtle">
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
                    <p className="text-sm text-muted">No activity yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
