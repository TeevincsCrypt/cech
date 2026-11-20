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
  const chip = tone === "green" ? "bg-accent" : tone === "red" ? "bg-danger" : tone === "yellow" ? "bg-warning" : "bg-ink";
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className={cn("flex size-[22px] items-center justify-center rounded-md text-white", chip)}>
          <Icon className="size-3.5" strokeWidth={2.5} />
        </span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <div className="mt-3 text-[28px] font-medium leading-none tabular-nums tracking-tight">{value ?? "—"}</div>}
      {hint && <p className="mt-2 text-xs text-subtle">{hint}</p>}
    </Card>
  );
}
