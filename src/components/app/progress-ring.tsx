import { cn } from "@/lib/utils";

export function ProgressRing({ value, size = 26, stroke = 4, className, color = "var(--info)" }: { value: number | null; size?: number; stroke?: number; className?: string; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} className={cn("-rotate-90 shrink-0", className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
    </svg>
  );
}
