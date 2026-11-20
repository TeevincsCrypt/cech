import { ArrowDown, ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "green" | "red" | "yellow" | "neutral" | "blue";

const CHIP: Record<Tone, string> = {
  green: "bg-accent text-white",
  red: "bg-danger text-white",
  yellow: "bg-warning text-white",
  blue: "bg-info text-white",
  neutral: "bg-ink text-white",
};
const HINT: Record<Tone, string> = {
  green: "text-accent",
  red: "text-danger",
  yellow: "text-warning",
  blue: "text-info",
  neutral: "text-subtle",
};

export interface StatItemProps {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  icon?: React.ElementType;
  hint?: React.ReactNode;
  loading?: boolean;
}

/** A row of stats separated by hairline dividers, each with a small icon chip. */
export function StatRow({ items, className }: { items: StatItemProps[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 border-y border-border lg:divide-x lg:divide-border", items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", className)}>
      {items.map((s, i) => (
        <StatItem key={s.label} {...s} className={cn(i % 2 === 1 && "max-lg:border-l max-lg:border-border", i >= 2 && "max-lg:border-t max-lg:border-border")} />
      ))}
    </div>
  );
}

export function StatItem({ label, value, tone = "neutral", icon, hint, loading, className }: StatItemProps & { className?: string }) {
  const Icon = icon ?? (tone === "red" ? ArrowDown : ArrowUp);
  return (
    <div className={cn("px-1 py-5 sm:px-6 lg:first:pl-0", className)}>
      <p className="text-sm text-foreground">{label}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("flex size-[22px] items-center justify-center rounded-md", CHIP[tone])}>
          <Icon className="size-3.5" strokeWidth={2.5} />
        </span>
        {loading ? <Skeleton className="h-8 w-16" /> : <span className="text-[28px] font-medium leading-none tabular-nums tracking-tight">{value}</span>}
        {hint && <span className={cn("ml-auto text-xs", HINT[tone])}>{hint}</span>}
      </div>
    </div>
  );
}
