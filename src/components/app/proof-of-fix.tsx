"use client";
import { ArrowRight, Clock, Download, FileJson, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { Screenshot } from "@/components/app/evidence-viewer";
import { ExecutionBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatElapsed, ISSUE_STATE_LABEL, type IssueState } from "@/lib/proof-of-fix";
import type { EvidenceArtifact, InspectionReport } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type ReportResult = InspectionReport["tests"][number]["results"][number];

const ISSUE_TONE: Record<IssueState, "green" | "red" | "yellow" | "grey" | "blue"> = {
  not_executed: "grey",
  passing: "green",
  open: "red",
  recurring: "red",
  regressed: "red",
  resolved: "yellow",
  verified: "green",
};

export function IssueBadge({ state }: { state: IssueState }) {
  if (state === "verified") {
    return (
      <Badge tone="green" className="font-semibold">
        <ShieldCheck className="size-3.5" /> Verified
      </Badge>
    );
  }
  return <Badge tone={ISSUE_TONE[state]}>{ISSUE_STATE_LABEL[state]}</Badge>;
}

function pick(r: ReportResult, kinds: EvidenceArtifact["kind"][]) {
  return kinds.map((k) => r.artifacts.find((a) => a.kind === k)).find(Boolean) ?? null;
}

function Side({ inspectionId, title, result, tone, kinds }: { inspectionId: string; title: string; result: ReportResult; tone: "red" | "green"; kinds: EvidenceArtifact["kind"][] }) {
  const shot = pick(result, kinds);
  const observed = result.analysis?.observed_behavior ?? result.kane_summary ?? result.kane_reason;
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", tone === "red" ? "text-danger" : "text-accent-strong")}>{title}</p>
        <ExecutionBadge status={result.execution_status} />
      </div>
      {shot ? (
        <Screenshot inspectionId={inspectionId} artifact={shot} />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-border-strong text-center text-xs text-muted">
          No screenshot was captured for this execution
        </div>
      )}
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-subtle">Executed</dt>
          <dd>{formatDate(result.completed_at ?? result.started_at)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-subtle">Expected</dt>
          <dd>{result.expected_outcome ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-subtle">Actual (Kane)</dt>
          <dd>{observed ?? "Not recorded"}</dd>
        </div>
        {(result.evidence?.url_before || result.evidence?.url_after) && (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-subtle">URL before → after</dt>
            <dd className="break-all font-mono text-xs">
              {result.evidence?.url_before ?? "—"} → {result.evidence?.url_after ?? "—"}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Before-and-after Proof of Fix. Only rendered for a fix the verification
 * engine proved from real Kane outcomes (or one that has since regressed).
 */
export function ProofOfFixCard({
  inspectionId,
  testCaseId,
  title,
  original,
  retest,
  elapsedMs,
  equivalence,
  status,
  reference,
}: {
  inspectionId: string;
  testCaseId: string;
  title: string;
  original: ReportResult;
  retest: ReportResult;
  elapsedMs: number | null;
  equivalence: "exact_objective" | "same_expected_outcome";
  status: "verified" | "regressed";
  reference: string | null;
}) {
  const verified = status === "verified";
  const base = `/api/inspections/${inspectionId}/proof/${testCaseId}`;
  return (
    <article className={cn("overflow-hidden rounded-3xl border", verified ? "border-accent/40" : "border-danger/40")}>
      <header className={cn("relative overflow-hidden px-6 py-5", verified ? "bg-accent-soft" : "bg-danger-soft")}>
        {verified && <div className="bg-heat pointer-events-none absolute -right-10 -top-16 h-40 w-72 rounded-full opacity-40 blur-3xl" aria-hidden />}
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("flex size-11 items-center justify-center rounded-full text-white", verified ? "bg-accent" : "bg-danger")}>
              {verified ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
            </span>
            <div>
              <p className={cn("text-[17px] font-bold tracking-tight", verified ? "text-accent-strong" : "text-danger")}>
                {verified ? "PROOF OF FIX — VERIFIED" : "REGRESSED — previously verified fix failed again"}
              </p>
              <p className="text-sm text-foreground/80">{title}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a href={`${base}?format=pdf`}>
                <Download /> PDF
              </a>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a href={`${base}?format=md`}>
                <FileText /> Markdown
              </a>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a href={`${base}?format=json`}>
                <FileJson /> JSON
              </a>
            </Button>
          </div>
        </div>
      </header>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto_1fr]">
        <Side inspectionId={inspectionId} title="Original inspection" result={original} tone="red" kinds={["at_failure", "after_viewport", "before"]} />
        <div className="flex items-center justify-center text-subtle md:flex-col">
          <ArrowRight className="size-5 rotate-90 md:rotate-0" />
        </div>
        <Side inspectionId={inspectionId} title="Retest" result={retest} tone="green" kinds={["after_viewport", "after_fullpage", "before"]} />
      </div>
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-6 py-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" /> {formatElapsed(elapsedMs)} between executions
        </span>
        <span>{equivalence === "exact_objective" ? "Exact replay of the original objective" : "Same test, start URL and expected outcome"}</span>
        {reference && <span className="font-mono">Ref {reference}</span>}
        <span className="basis-full text-subtle">Verified only from Kane&apos;s real browser outcomes: a genuine failure followed by an equivalent genuine pass. AI never decides verification.</span>
      </footer>
    </article>
  );
}
