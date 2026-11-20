import { cn } from "@/lib/utils";

export function HealthRing({ score, size = 112, className }: { score: number | null; size?: number; className?: string }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const color = score == null ? "var(--subtle)" : score >= 85 ? "var(--accent)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums">{score ?? "—"}</span>
        <span className="text-[10px] uppercase tracking-wider text-subtle">{score == null ? "no score" : "health"}</span>
      </div>
    </div>
  );
}
