import { cn } from "@/lib/utils";

/**
 * The signature blurred heat bar. Fill width = value (0–100); the gradient is
 * scaled to the full track so colour always reflects the absolute position.
 */
export function HeatBar({ value, label, className, height = 44 }: { value: number | null; label?: React.ReactNode; className?: string; height?: number }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      {/* soft glow beneath the fill */}
      <div aria-hidden className="absolute inset-x-0 top-[38%] h-full opacity-60 blur-[18px]">
        <div className="bg-heat h-full w-full" style={{ clipPath: `inset(0 ${100 - v}% 0 0)` }} />
      </div>
      <div className="absolute inset-0 overflow-hidden rounded-[10px] bg-surface-2">
        <div className="bg-heat absolute inset-y-0 left-0 w-full transition-[clip-path] duration-700 ease-out" style={{ clipPath: `inset(0 ${100 - v}% 0 0 round 10px)` }} />
      </div>
      {value != null && v > 0 && v < 100 && (
        <div aria-hidden className="absolute -top-1 -bottom-1 w-[3px] rounded-full bg-ink" style={{ left: `calc(${v}% - 1.5px)` }} />
      )}
      {label && <div className="absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-ink/80">{label}</div>}
    </div>
  );
}
