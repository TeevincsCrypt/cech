import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  loading,
}: {
  label: string;
  value: number | string | null;
  icon: React.ElementType;
  hint?: string;
  tone?: "default" | "green" | "red" | "yellow";
  loading?: boolean;
}) {
  const color = tone === "green" ? "text-accent" : tone === "red" ? "text-danger" : tone === "yellow" ? "text-warning" : "text-muted";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</span>
        <Icon className={cn("size-4", color)} />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value ?? "—"}</div>
      )}
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </Card>
  );
}
