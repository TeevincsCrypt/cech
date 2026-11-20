import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, ShieldCheck, Slash, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExecutionStatus, InspectionStatus, OverallStatus } from "@/lib/types";

type Exec = ExecutionStatus | "NOT_EXECUTED";

const EXEC: Record<Exec, { tone: "green" | "red" | "yellow" | "grey" | "blue"; label: string; icon: React.ElementType }> = {
  PASSED: { tone: "green", label: "Passed", icon: CheckCircle2 },
  FAILED: { tone: "red", label: "Failed", icon: XCircle },
  INCONCLUSIVE: { tone: "yellow", label: "Inconclusive", icon: AlertTriangle },
  TIMEOUT: { tone: "yellow", label: "Timeout", icon: Clock },
  ERROR: { tone: "grey", label: "Not executed", icon: Slash },
  QUEUED: { tone: "grey", label: "Queued", icon: CircleDashed },
  RUNNING: { tone: "blue", label: "Running", icon: Loader2 },
  NOT_EXECUTED: { tone: "grey", label: "Not executed", icon: CircleDashed },
};

export function ExecutionBadge({ status, className }: { status: Exec; className?: string }) {
  const s = EXEC[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={className}>
      <Icon className={`size-3.5 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {s.label}
    </Badge>
  );
}

const OVERALL: Record<OverallStatus, { tone: "green" | "red" | "yellow" | "grey" | "blue"; label: string; icon: React.ElementType }> = {
  verified: { tone: "green", label: "Verified", icon: ShieldCheck },
  passed: { tone: "green", label: "Passed", icon: CheckCircle2 },
  issues_found: { tone: "red", label: "Issues found", icon: XCircle },
  incomplete: { tone: "yellow", label: "Incomplete", icon: AlertTriangle },
  pending: { tone: "blue", label: "In progress", icon: Loader2 },
};

export function OverallBadge({ status, inspectionStatus }: { status: OverallStatus; inspectionStatus?: InspectionStatus }) {
  if (inspectionStatus === "failed") {
    return (
      <Badge tone="red">
        <XCircle className="size-3.5" /> Failed to run
      </Badge>
    );
  }
  const running = inspectionStatus && inspectionStatus !== "completed";
  const s = running ? OVERALL.pending : OVERALL[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className={`size-3.5 ${running ? "animate-spin" : ""}`} />
      {s.label}
    </Badge>
  );
}

export const execTone = (s: Exec) => EXEC[s].tone;
