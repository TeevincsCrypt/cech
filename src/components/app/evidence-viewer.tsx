"use client";
import { AlertTriangle, Camera, Download, Globe2, ImageOff, Maximize2, Monitor, Network, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ARTIFACT_KINDS, ARTIFACT_LABELS, type EvidenceArtifact, type ExecutionStatus, type TestResult } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export type EvidenceLabel = "failure" | "success" | "retest" | "inconclusive" | "not_executed" | "pending";

const LABEL: Record<EvidenceLabel, { text: string; tone: "red" | "green" | "yellow" | "grey" | "blue" }> = {
  failure: { text: "Failure Evidence", tone: "red" },
  success: { text: "Successful Execution", tone: "green" },
  retest: { text: "Retest Evidence", tone: "green" },
  inconclusive: { text: "Inconclusive Execution", tone: "yellow" },
  not_executed: { text: "Not executed — infrastructure", tone: "grey" },
  pending: { text: "Capturing…", tone: "blue" },
};

/** Label evidence by the REAL Kane outcome; missing evidence is never "successful evidence". */
export function evidenceLabel(status: ExecutionStatus, isRetestOfFailure: boolean): EvidenceLabel {
  if (status === "FAILED") return "failure";
  if (status === "PASSED") return isRetestOfFailure ? "retest" : "success";
  if (status === "TIMEOUT" || status === "INCONCLUSIVE") return "inconclusive";
  if (status === "ERROR") return "not_executed";
  return "pending";
}

export function evidenceSrc(inspectionId: string, a: EvidenceArtifact, download = false) {
  return `/api/inspections/${inspectionId}/evidence/${a.id}${download ? "?download=1" : ""}`;
}

export function Screenshot({ inspectionId, artifact, className, label }: { inspectionId: string; artifact: EvidenceArtifact; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = label ?? ARTIFACT_LABELS[artifact.kind];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group relative block w-full overflow-hidden rounded-2xl border border-border bg-surface-2 text-left", className)}
        aria-label={`Open screenshot: ${title}`}
      >
        {failed ? (
          <span className="flex aspect-video items-center justify-center gap-2 text-xs text-muted">
            <ImageOff className="size-4" /> Screenshot unavailable
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, authorised API route; not optimisable
          <img src={evidenceSrc(inspectionId, artifact)} alt={`${title} — ${artifact.page_url ?? "browser"}`} loading="lazy" onError={() => setFailed(true)} className="aspect-video w-full object-cover object-top" />
        )}
        <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-surface/90 text-ink opacity-0 shadow transition-opacity group-hover:opacity-100">
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Real browser capture · {formatDate(artifact.captured_at)}
            {artifact.page_url && <span className="block break-all font-mono text-xs">{artifact.page_url}</span>}
          </DialogDescription>
          <div className="mt-4 max-h-[70vh] overflow-auto rounded-2xl border border-border scrollbar-thin">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, authorised API route */}
            <img src={evidenceSrc(inspectionId, artifact)} alt={title} className="w-full" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
            <span>
              {artifact.width}×{artifact.height} · {(artifact.bytes / 1024).toFixed(0)} KB · sha256 {artifact.sha256.slice(0, 12)}…
            </span>
            <Button asChild size="sm" variant="secondary">
              <a href={evidenceSrc(inspectionId, artifact, true)}>
                <Download /> Download
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle" />
      <div className="min-w-0 text-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</p>
        <div className="mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

/** Evidence block for one Kane execution. */
export function EvidencePanel({
  inspectionId,
  result,
  artifacts,
  isRetestOfFailure,
  evidenceEnabled,
}: {
  inspectionId: string;
  result: TestResult;
  artifacts: EvidenceArtifact[];
  isRetestOfFailure: boolean;
  evidenceEnabled: boolean;
}) {
  const label = evidenceLabel(result.execution_status, isRetestOfFailure);
  const ev = result.evidence ?? null;
  const shots = ARTIFACT_KINDS.map((k) => artifacts.find((a) => a.kind === k)).filter((a): a is EvidenceArtifact => Boolean(a));
  const meta = LABEL[label];

  return (
    <section className="rounded-3xl bg-surface-2 p-5" aria-label={meta.text}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" /> Evidence
        </p>
        <Badge tone={meta.tone}>{meta.text}</Badge>
      </div>

      {label === "pending" ? (
        <p className="mt-3 text-sm text-muted">Evidence appears once Kane finishes this test.</p>
      ) : !ev ? (
        <p className="mt-3 text-sm text-muted">
          {evidenceEnabled ? "No evidence was recorded for this execution (it ran before Proof of Fix evidence capture was enabled)." : "Evidence storage is not enabled on this deployment."}
        </p>
      ) : (
        <>
          {shots.length > 0 ? (
            <div className={cn("mt-4 grid gap-3", shots.length > 1 ? "sm:grid-cols-2" : "")}>
              {shots.map((a) => (
                <figure key={a.id}>
                  <Screenshot inspectionId={inspectionId} artifact={a} />
                  <figcaption className="mt-1.5 text-xs text-muted">
                    {ARTIFACT_LABELS[a.kind]} · {formatDate(a.captured_at)}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <ImageOff className="size-4" /> No screenshot was captured for this execution{ev.capture_errors.length ? " — see capture notes below." : "."}
            </p>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {ev.viewport && (
              <Detail icon={Monitor} label="Browser viewport">
                {ev.viewport.width}×{ev.viewport.height} @{ev.viewport.deviceScaleFactor}x
              </Detail>
            )}
            {(ev.url_before || ev.url_after) && (
              <Detail icon={Globe2} label="URL before → after">
                <span className="font-mono text-xs">{ev.url_before ?? "—"}</span>
                <span className="mx-1 text-subtle">→</span>
                <span className={cn("font-mono text-xs", ev.url_before && ev.url_after && ev.url_before !== ev.url_after && "font-semibold")}>{ev.url_after ?? "not captured"}</span>
              </Detail>
            )}
            {ev.console_errors.length > 0 && (
              <Detail icon={TerminalSquare} label={`Console errors (${ev.console_errors.length})`}>
                <ul className="space-y-1">
                  {ev.console_errors.slice(0, 5).map((c, i) => (
                    <li key={i} className="font-mono text-xs text-danger">
                      {c.text}
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
            {ev.failed_requests.length > 0 && (
              <Detail icon={Network} label={`Failed requests (${ev.failed_requests.length})`}>
                <ul className="space-y-1">
                  {ev.failed_requests.slice(0, 5).map((r, i) => (
                    <li key={i} className="break-all font-mono text-xs">
                      <span className="text-danger">{r.status ?? r.error}</span> {r.method} {r.url}
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
          </div>
          {ev.console_errors.length === 0 && ev.failed_requests.length === 0 && ev.mode === "cdp" && (
            <p className="mt-3 text-xs text-subtle">No console errors or failed network requests were observed during this execution.</p>
          )}
          {ev.kane_evidence_pack?.sealed && <p className="mt-3 text-xs text-subtle">Kane sealed its own evidence pack for this run{result.kane_test_url ? " (see the Kane test run link)" : ""}.</p>}
          {ev.capture_errors.length > 0 && (
            <div className="mt-4 rounded-2xl bg-surface p-3 text-xs text-muted">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="size-3.5 text-warning" /> Evidence capture notes (do not affect the Kane result)
              </p>
              <ul className="space-y-0.5">
                {ev.capture_errors.map((c, i) => (
                  <li key={i}>· {c}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
