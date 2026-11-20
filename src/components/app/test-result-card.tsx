"use client";
import { Bot, ChevronDown, ExternalLink, Globe2, Terminal } from "lucide-react";
import { useState } from "react";
import { ExecutionBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AiAnalysis, InspectionReport, TestResult, VerificationRun } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

type ReportTest = InspectionReport["tests"][number];
type ResultWithAnalysis = TestResult & { analysis: AiAnalysis | null };

const BORDER: Record<string, string> = {
  PASSED: "border-l-accent",
  FAILED: "border-l-danger",
  INCONCLUSIVE: "border-l-warning",
  TIMEOUT: "border-l-warning",
  ERROR: "border-l-subtle",
  RUNNING: "border-l-info",
  QUEUED: "border-l-border-strong",
  NOT_EXECUTED: "border-l-border-strong",
};

const ERROR_KIND_LABEL: Record<string, string> = {
  auth: "Kane not authenticated",
  browser: "Browser failed to start",
  network: "Network error",
  worker: "Worker error",
  url_rejected: "URL rejected by worker",
  timeout: "Timed out",
  no_verdict: "No verdict from Kane",
  blocked_by_site: "Site blocked automation",
  unknown: "Unknown error",
};

function SeverityBadge({ severity }: { severity: AiAnalysis["severity"] }) {
  if (!severity || severity === "none") return null;
  const tone = severity === "critical" || severity === "high" ? "red" : severity === "medium" ? "yellow" : "grey";
  return <Badge tone={tone}>{severity} severity</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function Evidence({ value }: { value: string | null }) {
  if (!value) return <span className="text-subtle">No evidence pack reference returned</span>;
  if (/^https:\/\//.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
        Kane test run <ExternalLink className="size-3" />
      </a>
    );
  }
  return <code className="break-all font-mono text-xs text-muted">{value}</code>;
}

function ExecutionLog({ result }: { result: TestResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
        <Terminal className="size-3.5" /> Execution log
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {result.steps.length > 0 && (
          <ol className="space-y-1 rounded-lg border border-border bg-background p-3 font-mono text-xs">
            {result.steps.map((s) => (
              <li key={s.step} className="flex gap-2">
                <span className="w-6 shrink-0 text-right text-subtle">{s.step}</span>
                <span className={cn("w-14 shrink-0", s.status === "failed" ? "text-danger" : s.status === "running" ? "text-info" : "text-accent")}>{s.status}</span>
                <span className="text-foreground/80">{s.remark}</span>
              </li>
            ))}
          </ol>
        )}
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-subtle">
            Raw stdout (NDJSON){result.exit_code != null && ` · exit code ${result.exit_code}`}
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin">
            {result.raw_output?.trim() || "(empty)"}
          </pre>
        </div>
        {result.stderr?.trim() && (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-subtle">stderr</p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin">
              {result.stderr.trim()}
            </pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultBody({ result }: { result: ResultWithAnalysis }) {
  const a = result.analysis;
  const live = result.execution_status === "RUNNING" || result.execution_status === "QUEUED";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Layer A: real browser execution */}
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Globe2 className="size-3.5" /> Browser outcome · Kane CLI
        </p>
        <Field label="Objective executed">
          <span className="font-mono text-xs text-muted">{result.objective}</span>
          {result.objective_note && <span className="mt-1 block text-xs text-info">↳ {result.objective_note}</span>}
        </Field>
        {live ? (
          <div className="space-y-1.5">
            {result.steps.length === 0 ? (
              <p className="text-sm text-muted">{result.execution_status === "QUEUED" ? "Waiting for a browser slot…" : "Kane is opening the browser…"}</p>
            ) : (
              result.steps.slice(-4).map((s) => (
                <p key={s.step} className="flex gap-2 text-sm">
                  <span className="font-mono text-xs text-subtle">#{s.step}</span>
                  <span className={s.status === "running" ? "text-info" : "text-foreground/80"}>{s.remark}</span>
                </p>
              ))
            )}
          </div>
        ) : (
          <>
            {(result.kane_summary || result.kane_reason) && (
              <Field label="Kane reported">
                {result.kane_summary}
                {result.kane_reason && result.kane_reason !== result.kane_summary && <span className="block text-muted">Reason: {result.kane_reason}</span>}
              </Field>
            )}
            {result.error_kind && (
              <Field label="Execution problem">
                <Badge tone={result.execution_status === "ERROR" ? "grey" : "yellow"}>{ERROR_KIND_LABEL[result.error_kind] ?? result.error_kind}</Badge>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Duration">{formatDuration(result.duration_ms)}</Field>
              <Field label="Evidence">
                <Evidence value={result.kane_test_url ?? result.evidence_reference} />
              </Field>
            </div>
          </>
        )}
      </div>

      {/* Layer B: AI interpretation */}
      <div className="space-y-4 lg:border-l lg:border-border lg:pl-5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Bot className="size-3.5" /> AI interpretation · {a?.source === "groq" ? "Groq" : a?.source === "system" ? "CECH (no AI needed)" : "Groq"}
        </p>
        {!a ? (
          <p className="text-sm text-muted">{live ? "Analysis runs once Kane returns a result." : "Analysing Kane's output…"}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={a.severity} />
              {a.confidence && <Badge tone="outline">{a.confidence} confidence</Badge>}
              {a.source === "unavailable" && <Badge tone="yellow">AI unavailable</Badge>}
            </div>
            <p className="text-sm leading-relaxed">{a.summary}</p>
            {a.expected_behavior && <Field label="Expected behaviour">{a.expected_behavior}</Field>}
            {a.observed_behavior && <Field label="Observed behaviour">{a.observed_behavior}</Field>}
            {a.recommendation && (
              <Field label="Recommended fix">
                <span className="block rounded-lg border border-border bg-surface-2 p-3">{a.recommendation}</span>
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function TestResultCard({ test, runs }: { test: ReportTest; runs: VerificationRun[] }) {
  const latest = test.results.at(-1) ?? null;
  const previous = test.results.slice(0, -1).reverse();
  const status = latest?.execution_status ?? "NOT_EXECUTED";
  const runOf = (r: TestResult) => runs.find((x) => x.id === r.verification_run_id);
  const [showPrev, setShowPrev] = useState(false);

  return (
    <article className={cn("rounded-xl border border-l-[3px] border-border bg-surface", BORDER[status], status === "RUNNING" && "shadow-[0_0_0_1px_rgb(106_168_255/0.25)]")}>
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-medium leading-snug">{test.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="outline">{CATEGORY_LABELS[test.category]}</Badge>
            <Badge tone={test.priority === "high" ? "red" : test.priority === "medium" ? "yellow" : "grey"}>{test.priority} priority</Badge>
            {latest && <span className="text-subtle">Run {runOf(latest)?.sequence ?? "?"}</span>}
            {test.assumption && (
              <span className="text-warning" title={test.assumption}>
                Assumption: {test.assumption}
              </span>
            )}
          </div>
        </div>
        <ExecutionBadge status={status} className="self-start" />
      </header>
      <div className="space-y-5 p-5">
        {latest ? <ResultBody result={latest} /> : <p className="text-sm text-muted">Not executed yet.</p>}
        <div className="flex flex-wrap items-center gap-5 border-t border-border pt-4">
          {latest && <ExecutionLog result={latest} />}
          {previous.length > 0 && (
            <button onClick={() => setShowPrev((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
              Previous attempts ({previous.length})
              <ChevronDown className={cn("size-3.5 transition-transform", showPrev && "rotate-180")} />
            </button>
          )}
        </div>
        {showPrev &&
          previous.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface-2/50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Run {runOf(r)?.sequence ?? "?"}</span>
                <ExecutionBadge status={r.execution_status} />
              </div>
              <ResultBody result={r} />
              <div className="mt-4">
                <ExecutionLog result={r} />
              </div>
            </div>
          ))}
      </div>
    </article>
  );
}
