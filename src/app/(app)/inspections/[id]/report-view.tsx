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
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { CategoryFlower } from "@/components/app/category-flower";
import { DemoModePanel } from "@/components/app/demo-mode-panel";
import { HeatBar } from "@/components/app/heat-bar";
import { PageHeader } from "@/components/app/page-header";
import { RunComparison, changeOf } from "@/components/app/run-comparison";
import { StatRow } from "@/components/app/stat-row";
import { OverallBadge } from "@/components/app/status-badge";
import { ErrorState, LoadingState } from "@/components/app/states";
import { TestResultCard } from "@/components/app/test-result-card";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { useApi } from "@/lib/client/use-api";
import { computeHealthScore } from "@/lib/scoring";
import { TEST_CATEGORIES, type InspectionReport, type TestCategory } from "@/lib/types";
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
  const idx = ["planning", "dispatching", "running", "analyzing", "completed"].indexOf(inspection.status);
  const stages = [
    {
      icon: Sparkles,
      title: isRetest ? "Groq writes focused retest objectives" : "Groq generates testing objectives",
      detail: isRetest ? "From Kane's real previous results" : "Grounded in the page's real structure",
    },
    { icon: Send, title: "Objectives sent to the Kane worker", detail: total ? `${total} objectives` : "" },
    { icon: Globe2, title: "Kane executes in a real browser", detail: total ? `${done}/${total} complete` : "" },
    { icon: Bot, title: "Groq analyses actual findings", detail: total ? `${analysed}/${total} analysed` : "" },
  ];

  return (
    <section className="mb-10 rounded-3xl bg-surface-2 p-6">
      <div className="flex items-center gap-2.5">
        <Loader2 className="size-4 animate-spin text-ink" />
        <p className="font-semibold">{isRetest ? `Verification run ${run?.sequence} in progress` : "Inspection in progress"}</p>
        <span className="text-sm text-muted">· updates live</span>
      </div>
      <ol className="mt-5 grid gap-3 md:grid-cols-4">
        {stages.map((st, i) => {
          const state = i < idx ? "done" : i === idx ? "active" : "todo";
          const Icon = st.icon;
          return (
            <li key={st.title} className={cn("rounded-2xl p-4 transition-colors", state === "active" ? "bg-ink text-white" : state === "done" ? "bg-surface" : "bg-surface/50 text-subtle")}>
              <div className="flex items-center justify-between">
                <span className={cn("text-xs", state === "active" ? "text-white/60" : "text-subtle")}>Step {i + 1}</span>
                {state === "done" ? <CheckCircle2 className="size-4 text-accent" /> : <Icon className={cn("size-4", state === "active" && "animate-pulse-dot")} />}
              </div>
              <p className="mt-3 text-sm font-medium leading-snug">{st.title}</p>
              {st.detail && <p className={cn("mt-1 text-xs", state === "active" ? "text-white/70" : "text-muted")}>{st.detail}</p>}
            </li>
          );
        })}
      </ol>
      {total > 0 && <Progress value={(done / total) * 100} className="mt-5 bg-surface" />}
    </section>
  );
}

function ScoreExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <Info className="size-3.5" /> How is this calculated?
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
          <p className="font-mono text-ink">score = passed weight ÷ conclusive weight × 100</p>
          <p>Weights: high priority = 3, medium = 2, low = 1, using the latest Kane outcome of each test.</p>
          <p>Only conclusive browser verdicts (Passed / Failed) count. Infrastructure errors, timeouts, inconclusive and unexecuted tests are excluded — they are not website failures.</p>
          <p>The score is withheld when fewer than 2 tests are conclusive or most executed tests were inconclusive.</p>
          <p className="text-warning">It summarises the checks that ran. It is not a guarantee that the site is secure or defect-free.</p>
        </div>
      )}
    </div>
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

  const derived = useMemo(() => {
    if (!data) return null;
    const latest = data.tests.map((t) => t.results.at(-1)?.execution_status ?? "NOT_EXECUTED");
    const score = computeHealthScore(data.tests.map((t, i) => ({ priority: t.priority, status: latest[i] })));
    const cat = (c: TestCategory) => {
      const own = data.tests.filter((t) => t.category === c).map((t) => t.results.at(-1)?.execution_status);
      const p = own.filter((s) => s === "PASSED").length;
      const f = own.filter((s) => s === "FAILED").length;
      return p + f ? Math.round((p / (p + f)) * 100) : null;
    };
    const attempted = latest.filter((s) => TERMINAL.includes(s)).length;
    const conclusive = latest.filter((s) => s === "PASSED" || s === "FAILED").length;
    const changes = data.tests.map((t) => changeOf(data.runs.map((r) => t.results.find((x) => x.verification_run_id === r.id)?.execution_status ?? null)));
    const resolved = changes.filter((c) => c?.label === "Resolved").length;
    const recurring = changes.filter((c) => c?.label === "Recurring").length;
    return {
      latest,
      score,
      categories: Object.fromEntries(TEST_CATEGORIES.map((c) => [c, cat(c)])) as Record<TestCategory, number | null>,
      conclusiveRate: attempted ? Math.round((conclusive / attempted) * 100) : null,
      fixRate: resolved + recurring ? Math.round((resolved / (resolved + recurring)) * 100) : null,
      resolved,
    };
  }, [data]);

  if (loading && !data) return <LoadingState label="Loading inspection report…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !derived) return null;

  const { inspection, runs, tests } = data;
  const n = (...s: string[]) => derived.latest.filter((x) => s.includes(x)).length;
  const executed = n("PASSED", "FAILED", "INCONCLUSIVE", "TIMEOUT");
  const notPassed = derived.latest.filter((x) => x !== "PASSED").length;
  const busy = inspection.status !== "completed" && inspection.status !== "failed";
  const finished = inspection.status === "completed";
  const end = inspection.completed_at ?? (busy ? new Date().toISOString() : null);
  const isDemo = /\/demo\/?$/.test(new URL(inspection.website_url).pathname);
  const shownScore = finished ? derived.score.score : null;

  async function startRetest(scope: "failed" | "all") {
    setRetesting(true);
    setRetestError(null);
    try {
      const res = await fetch(`/api/inspections/${id}/retest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }) });
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
      <PageHeader
        title="Inspection Report"
        cta={false}
        actions={
          <>
            <Tooltip content="Download report (Markdown)">
              <IconButton asChild>
                <a href={`/api/inspections/${id}/report?format=md`} aria-label="Download report (Markdown)">
                  <Download />
                </a>
              </IconButton>
            </Tooltip>
            <Tooltip content="Download report (JSON)">
              <IconButton asChild>
                <a href={`/api/inspections/${id}/report?format=json`} aria-label="Download report (JSON)">
                  <FileJson />
                </a>
              </IconButton>
            </Tooltip>
            <Button variant="secondary" disabled={busy || tests.length === 0} onClick={() => setRetestOpen("all")}>
              Retest all
            </Button>
            <Button disabled={busy || notPassed === 0} onClick={() => setRetestOpen("failed")}>
              <RotateCcw /> Retest failed tests
            </Button>
          </>
        }
      />

      {/* Identity line */}
      <div className="-mt-6 mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        <OverallBadge status={inspection.overall_status} inspectionStatus={inspection.status} />
        <a href={inspection.website_url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink underline-offset-4 hover:underline">
          {inspection.website_url}
        </a>
        <span>
          ID <span className="font-mono text-foreground">{inspection.id.slice(0, 8)}</span>
        </span>
        <span>{formatDate(inspection.created_at)}</span>
        <span>Duration {end ? formatDuration(Date.parse(end) - Date.parse(inspection.created_at)) : "—"}</span>
        <span>
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
        {inspection.plan_source && <span>Plan: {inspection.plan_source === "groq" ? "Groq AI" : "Baseline (Groq unavailable)"}</span>}
      </div>

      {inspection.status === "failed" && (
        <div className="mb-8 flex items-start gap-3 rounded-3xl bg-danger-soft p-5 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-medium">This inspection could not run</p>
            <p className="mt-1 text-muted">{inspection.error}</p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/inspections/new">Start a new inspection</Link>
            </Button>
          </div>
        </div>
      )}

      {busy && <Pipeline report={data} />}

      {/* Hero: health score + heat bar */}
      <section className="grid items-end gap-8 pb-10 lg:grid-cols-[260px_1fr] lg:gap-14">
        <div>
          <p className={cn("text-[88px] font-medium leading-[0.9] tracking-[-0.04em] tabular-nums sm:text-[104px]", shownScore == null && "text-border-strong")}>{shownScore ?? "—"}</p>
          <p className="mt-3 text-sm text-muted">health score</p>
        </div>
        <div className="pb-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 text-sm text-muted">
            {!finished ? (
              <span>Calculated when the run completes</span>
            ) : derived.score.score == null ? (
              <span className="text-warning">Insufficient data to calculate a reliable health score. {derived.score.reason}</span>
            ) : (
              <span>
                <span className="mr-1.5 text-[22px] font-semibold text-ink">{derived.score.passedWeight}</span>of {derived.score.conclusiveWeight} weighted points passed
              </span>
            )}
            <ScoreExplainer />
          </div>
          <HeatBar value={shownScore} label={shownScore != null ? `${shownScore}/100` : undefined} height={48} />
        </div>
      </section>

      <StatRow
        items={[
          { label: "Tests executed", value: executed, tone: "neutral", icon: FlaskConical, hint: `${tests.length} planned` },
          { label: "Passed", value: n("PASSED"), tone: "green", icon: CheckCircle2, hint: derived.resolved ? `${derived.resolved} resolved` : undefined },
          { label: "Failed", value: n("FAILED"), tone: "red", icon: XCircle, hint: "browser-confirmed" },
          { label: "Inconclusive", value: n("INCONCLUSIVE", "TIMEOUT"), tone: "yellow", icon: AlertTriangle, hint: n("ERROR") ? `${n("ERROR")} not executed` : undefined },
        ]}
      />

      {inspection.plan_notes && (
        <p className="mt-6 flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {inspection.plan_notes}
        </p>
      )}
      {inspection.error && inspection.status !== "failed" && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {inspection.error}
        </p>
      )}

      {/* Summary + quality map */}
      <section className="grid gap-10 pt-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-0">
        <div className="min-w-0 space-y-6 lg:pr-10">
          {inspection.summary && !busy ? (
            <div>
              <div className="flex items-center gap-2 text-xs text-subtle">
                <Bot className="size-4" />
                {inspection.summary.source === "groq" ? "Summary by Groq, based on real Kane outcomes" : "Counts from real Kane outcomes"}
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{inspection.summary.headline}</h2>
              <p className="mt-3 leading-relaxed text-muted">{inspection.summary.overview}</p>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {inspection.summary.key_issues.length > 0 && (
                  <div className="rounded-3xl bg-danger-soft/60 p-5">
                    <p className="mb-3 text-sm font-semibold">Key issues</p>
                    <ul className="space-y-2 text-sm">
                      {inspection.summary.key_issues.map((k) => (
                        <li key={k} className="flex gap-2">
                          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {inspection.summary.next_steps.length > 0 && (
                  <div className="rounded-3xl bg-surface-2 p-5">
                    <p className="mb-3 text-sm font-semibold">Next steps</p>
                    <ul className="space-y-2 text-sm">
                      {inspection.summary.next_steps.map((k) => (
                        <li key={k} className="flex gap-2">
                          <span className="text-ink">→</span> {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {inspection.overall_status === "verified" && (
                <p className="mt-5 flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-strong">
                  <ShieldCheck className="size-4" /> All selected tests now pass. Previously failed checks were independently re-verified by Kane.
                </p>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Summary</h2>
              <p className="mt-3 text-sm text-muted">The summary appears once Kane has finished and Groq has analysed the results.</p>
            </div>
          )}
          {isDemo && !busy && <DemoModePanel compact />}
        </div>
        <aside className="lg:border-l lg:border-border lg:pl-10">
          <h2 className="text-xl font-semibold tracking-tight">Quality map</h2>
          <div className="mt-6">
            <CategoryFlower
              metrics={[
                { label: "Navigation", value: derived.categories.navigation },
                { label: "Forms", value: derived.categories.forms },
                { label: "Fixes verified", value: derived.fixRate },
                { label: "Journeys", value: derived.categories.journey },
                { label: "Conclusive", value: derived.conclusiveRate },
                { label: "Interface", value: derived.categories.interface },
              ]}
              center={<ShieldCheck className="size-5 text-ink" strokeWidth={2.4} />}
            />
          </div>
        </aside>
      </section>

      {runs.length > 1 && (
        <section className="mt-12 border-t border-border pt-9">
          <h2 className="text-xl font-semibold tracking-tight">Verification history</h2>
          <p className="mt-1 text-sm text-muted">Real Kane outcomes for each test across runs</p>
          <div className="mt-5">
            <RunComparison report={data} />
          </div>
        </section>
      )}

      <section className="mt-12 border-t border-border pt-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Test results</h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{n("PASSED")} passed</Badge>
            <Badge tone="red">{n("FAILED")} failed</Badge>
            <Badge tone="yellow">{n("INCONCLUSIVE", "TIMEOUT")} inconclusive</Badge>
            <Badge tone="grey">{n("ERROR", "NOT_EXECUTED")} not executed</Badge>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          {tests.length === 0 && busy && (
            <div className="rounded-3xl bg-surface-2 p-10 text-center text-sm text-muted">
              <Sparkles className="mx-auto mb-3 size-5 animate-pulse-dot text-ink" />
              Groq is generating testing objectives for this website…
            </div>
          )}
          {tests.map((t) => (
            <TestResultCard key={t.id} test={t} runs={runs} />
          ))}
        </div>
      </section>

      <Dialog open={retestOpen != null} onOpenChange={(o) => !o && setRetestOpen(null)}>
        <DialogContent>
          <DialogTitle>{retestOpen === "all" ? "Retest all tests" : `Retest ${notPassed} failed or unverified test${notPassed === 1 ? "" : "s"}`}</DialogTitle>
          <DialogDescription>
            Groq will use Kane&apos;s real results from the previous run to write focused retest objectives, then Kane will independently re-execute them in a real browser. CECH
            doesn&apos;t change your code. Apply your fixes first, then retest.
          </DialogDescription>
          {isDemo && (
            <div className="mt-5">
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
