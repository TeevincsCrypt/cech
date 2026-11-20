"use client";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  FileJson,
  FlaskConical,
  Globe2,
  Info,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { DemoModePanel } from "@/components/app/demo-mode-panel";
import { HealthRing } from "@/components/app/health-ring";
import { RunComparison } from "@/components/app/run-comparison";
import { StatCard } from "@/components/app/stat-card";
import { OverallBadge } from "@/components/app/status-badge";
import { ErrorState, LoadingState } from "@/components/app/states";
import { TestResultCard } from "@/components/app/test-result-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/lib/client/use-api";
import { computeHealthScore } from "@/lib/scoring";
import type { InspectionReport } from "@/lib/types";
import { cn, formatDate, formatDuration } from "@/lib/utils";

const TERMINAL = ["PASSED", "FAILED", "ERROR", "TIMEOUT", "INCONCLUSIVE"];

function Pipeline({ report }: { report: InspectionReport }) {
  const { inspection, runs, tests } = report;
  const run = runs.at(-1);
  const isRetest = run && run.run_type !== "initial";
  const runResults = run ? tests.flatMap((t) => t.results.filter((r) => r.verification_run_id === run.id)) : [];
  const done = runResults.filter((r) => TERMINAL.includes(r.execution_status)).length;
  const total = run?.test_case_ids.length ?? 0;
  const analysed = runResults.filter((r) => r.analysis).length;
  const s = inspection.status;

  const order = ["planning", "dispatching", "running", "analyzing", "completed"];
  const idx = order.indexOf(s);
  const stages = [
    {
      key: "planning",
      icon: Sparkles,
      title: isRetest ? "Groq writes focused retest objectives" : "Groq generates testing objectives",
      detail: isRetest ? "Using Kane's real results from the previous run" : "Probing the page structure, then planning",
    },
    { key: "dispatching", icon: Send, title: "Objectives sent to Kane worker", detail: total ? `${total} objectives` : "" },
    { key: "running", icon: Globe2, title: "Kane executes in a real browser", detail: total ? `${done}/${total} complete` : "" },
    { key: "analyzing", icon: Bot, title: "Groq analyses actual findings", detail: total ? `${analysed}/${total} analysed` : "" },
  ];

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-accent" />
          {isRetest ? `Verification run ${run?.sequence} in progress` : "Inspection in progress"}
        </CardTitle>
        <CardDescription>This page updates live. Results appear as Kane finishes each test.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-4">
          {stages.map((st, i) => {
            const state = i < idx ? "done" : i === idx ? "active" : "todo";
            const Icon = st.icon;
            return (
              <li
                key={st.key}
                className={cn(
                  "rounded-lg border p-3",
                  state === "active" ? "border-accent/50 bg-accent-soft/30" : state === "done" ? "border-border bg-surface-2" : "border-border opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  {state === "done" ? (
                    <CheckCircle2 className="size-4 text-accent" />
                  ) : state === "active" ? (
                    <Icon className="size-4 animate-pulse-dot text-accent" />
                  ) : (
                    <Icon className="size-4 text-subtle" />
                  )}
                  <span className="text-xs font-medium">Step {i + 1}</span>
                </div>
                <p className="mt-2 text-sm leading-snug">{st.title}</p>
                {st.detail && <p className="mt-1 text-xs text-muted">{st.detail}</p>}
              </li>
            );
          })}
        </ol>
        {total > 0 && <Progress value={(done / total) * 100} className="mt-4" />}
      </CardContent>
    </Card>
  );
}

function HealthPanel({ report }: { report: InspectionReport }) {
  const [open, setOpen] = useState(false);
  const score = useMemo(
    () => computeHealthScore(report.tests.map((t) => ({ priority: t.priority, status: t.results.at(-1)?.execution_status ?? "NOT_EXECUTED" }))),
    [report],
  );
  const finished = report.inspection.status === "completed";
  return (
    <Card className="p-5">
      <div className="flex items-center gap-5">
        <HealthRing score={finished ? score.score : null} size={96} className="shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="font-medium">Health score</p>
          {finished && score.score == null ? (
            <p className="mt-1 text-xs text-warning">Insufficient data to calculate a reliable health score. {score.reason}</p>
          ) : finished ? (
            <p className="mt-1 text-xs text-muted tabular-nums">
              {score.passedWeight} of {score.conclusiveWeight} weighted points passed
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">Calculated when the run completes.</p>
          )}
          <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <Info className="size-3.5" /> How is this calculated?
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <p className="font-mono text-foreground">score = passed weight ÷ conclusive weight × 100</p>
          <p>Weights: high priority = 3, medium = 2, low = 1. Uses the latest Kane outcome of each test.</p>
          <p>Only conclusive browser verdicts (Passed / Failed) count. Infrastructure errors, timeouts, inconclusive and unexecuted tests are excluded — they are not treated as website failures.</p>
          <p>The score is withheld when fewer than 2 tests are conclusive, or when most executed tests were inconclusive.</p>
          <p className="text-warning">The score summarises the checks that ran. It is not a guarantee that the site is secure or defect-free.</p>
        </div>
      )}
    </Card>
  );
}

export function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<InspectionReport>(`/api/inspections/${id}`, {
    pollMs: (d) => (!d || (d.inspection.status !== "completed" && d.inspection.status !== "failed") ? 2500 : null),
  });
  const [retestOpen, setRetestOpen] = useState<null | "failed" | "all">(null);
  const [retesting, setRetesting] = useState(false);
  const [retestError, setRetestError] = useState<string | null>(null);

  if (loading && !data) return <LoadingState label="Loading inspection report…" />;
  if (error && !data)
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  if (!data) return null;

  const { inspection, runs, tests } = data;
  const latest = tests.map((t) => t.results.at(-1)?.execution_status ?? "NOT_EXECUTED");
  const n = (...s: string[]) => latest.filter((x) => s.includes(x)).length;
  const executed = n("PASSED", "FAILED", "INCONCLUSIVE", "TIMEOUT");
  const notPassed = latest.filter((x) => x !== "PASSED").length;
  const busy = inspection.status !== "completed" && inspection.status !== "failed";
  const end = inspection.completed_at ?? (busy ? new Date().toISOString() : null);
  const isDemo = /\/demo\/?$/.test(new URL(inspection.website_url).pathname);

  async function startRetest(scope: "failed" | "all") {
    setRetesting(true);
    setRetestError(null);
    try {
      const res = await fetch(`/api/inspections/${id}/retest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not start retest");
      setRetestOpen(null);
      await reload();
    } catch (e) {
      setRetestError((e as Error).message);
    } finally {
      setRetesting(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Inspection Report</h1>
            <OverallBadge status={inspection.overall_status} inspectionStatus={inspection.status} />
          </div>
          <a href={inspection.website_url} target="_blank" rel="noreferrer noopener" className="mt-2 block truncate text-sm text-accent hover:underline">
            {inspection.website_url}
          </a>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <div>
              <dt className="inline text-subtle">ID </dt>
              <dd className="inline font-mono">{inspection.id.slice(0, 8)}</dd>
            </div>
            <div>
              <dt className="inline text-subtle">Date </dt>
              <dd className="inline">{formatDate(inspection.created_at)}</dd>
            </div>
            <div>
              <dt className="inline text-subtle">Duration </dt>
              <dd className="inline">{end ? formatDuration(Date.parse(end) - Date.parse(inspection.created_at)) : "—"}</dd>
            </div>
            <div>
              <dt className="inline text-subtle">Runs </dt>
              <dd className="inline">{runs.length}</dd>
            </div>
            {inspection.plan_source && (
              <div>
                <dt className="inline text-subtle">Plan </dt>
                <dd className="inline">{inspection.plan_source === "groq" ? "Groq AI" : "Baseline (Groq unavailable)"}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || notPassed === 0} onClick={() => setRetestOpen("failed")}>
            <RotateCcw /> Retest failed tests
          </Button>
          <Button variant="secondary" disabled={busy || tests.length === 0} onClick={() => setRetestOpen("all")}>
            Retest all tests
          </Button>
          <Button variant="outline" size="icon" asChild title="Download report (Markdown)">
            <a href={`/api/inspections/${id}/report?format=md`}>
              <Download />
              <span className="sr-only">Download report (Markdown)</span>
            </a>
          </Button>
          <Button variant="outline" size="icon" asChild title="Download report (JSON)">
            <a href={`/api/inspections/${id}/report?format=json`}>
              <FileJson />
              <span className="sr-only">Download report (JSON)</span>
            </a>
          </Button>
        </div>
      </div>

      {inspection.status === "failed" && (
        <Card className="mb-6 border-danger/40">
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div>
              <p className="font-medium">This inspection could not run</p>
              <p className="mt-1 text-muted">{inspection.error}</p>
              <Button asChild size="sm" variant="secondary" className="mt-3">
                <Link href="/inspections/new">Start a new inspection</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {busy && <Pipeline report={data} />}

      {inspection.plan_notes && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {inspection.plan_notes}
        </p>
      )}
      {inspection.error && inspection.status !== "failed" && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {inspection.error}
        </p>
      )}

      {/* Summary row */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tests executed" value={executed} icon={FlaskConical} hint={`${tests.length} planned · ${n("ERROR")} not executed`} />
          <StatCard label="Passed" value={n("PASSED")} icon={CheckCircle2} tone="green" />
          <StatCard label="Failed" value={n("FAILED")} icon={XCircle} tone="red" />
          <StatCard label="Inconclusive" value={n("INCONCLUSIVE", "TIMEOUT")} icon={AlertTriangle} tone="yellow" />
        </div>
        <HealthPanel report={data} />
      </div>

      {/* AI summary */}
      {inspection.summary && !busy && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-accent" /> {inspection.summary.headline}
            </CardTitle>
            <CardDescription>
              {inspection.summary.source === "groq" ? "Summary by Groq, based on real Kane outcomes" : "Counts from real Kane outcomes"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="leading-relaxed text-foreground/90">{inspection.summary.overview}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {inspection.summary.key_issues.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Key issues</p>
                  <ul className="space-y-1.5">
                    {inspection.summary.key_issues.map((k) => (
                      <li key={k} className="flex gap-2">
                        <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" /> {k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {inspection.summary.next_steps.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Next steps</p>
                  <ul className="space-y-1.5">
                    {inspection.summary.next_steps.map((k) => (
                      <li key={k} className="flex gap-2">
                        <span className="text-accent">→</span> {k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {inspection.overall_status === "verified" && (
              <p className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-accent">
                <CheckCircle2 className="size-4" /> All selected tests now pass. Previously failed checks were independently re-verified by Kane.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isDemo && !busy && (
        <div className="mt-6">
          <DemoModePanel compact />
        </div>
      )}

      {/* Verification history */}
      {runs.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Verification history</CardTitle>
            <CardDescription>Real Kane outcomes for each test across runs</CardDescription>
          </CardHeader>
          <RunComparison report={data} />
        </Card>
      )}

      {/* Tests */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-base font-semibold">Test results</h2>
        <div className="flex gap-2 text-xs">
          <Badge tone="green">{n("PASSED")} passed</Badge>
          <Badge tone="red">{n("FAILED")} failed</Badge>
          <Badge tone="yellow">{n("INCONCLUSIVE", "TIMEOUT")} inconclusive</Badge>
          <Badge tone="grey">{n("ERROR", "NOT_EXECUTED")} not executed</Badge>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {tests.length === 0 && busy && (
          <Card className="p-8 text-center text-sm text-muted">
            <Sparkles className="mx-auto mb-3 size-5 animate-pulse-dot text-accent" />
            Groq is generating testing objectives for this website…
          </Card>
        )}
        {tests.map((t) => (
          <TestResultCard key={t.id} test={t} runs={runs} />
        ))}
      </div>

      <Dialog open={retestOpen != null} onOpenChange={(o) => !o && setRetestOpen(null)}>
        <DialogContent>
          <DialogTitle>{retestOpen === "all" ? "Retest all tests" : `Retest ${notPassed} failed or unverified test${notPassed === 1 ? "" : "s"}`}</DialogTitle>
          <DialogDescription>
            Groq will use Kane&apos;s real results from the previous run to write focused retest objectives, then Kane will independently re-execute them in a real browser. CECH
            doesn&apos;t change your code. Apply your fixes first, then retest.
          </DialogDescription>
          {isDemo && (
            <div className="mt-4">
              <DemoModePanel compact />
            </div>
          )}
          {retestError && <p className="mt-3 text-sm text-danger">{retestError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={() => retestOpen && startRetest(retestOpen)} disabled={retesting}>
              {retesting ? <Loader2 className="animate-spin" /> : <RotateCcw />} Start retest
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
