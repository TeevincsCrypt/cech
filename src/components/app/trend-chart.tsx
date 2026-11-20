"use client";
import { useState } from "react";
import { cn, formatDate, hostOf } from "@/lib/utils";

/** Health score trend as a minimal bar chart (inline SVG, no chart library). */
export function TrendChart({ points, className }: { points: Array<{ id: string; score: number; at: string; url: string }>; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const h = 96;
  const gap = 6;
  const w = Math.max(points.length * 28, 140);
  const bw = (w - gap * (points.length - 1)) / points.length;
  const active = hover != null ? points[hover] : points.at(-1)!;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="truncate text-muted">{hostOf(active.url)}</span>
        <span className="tabular-nums text-foreground">
          {active.score} <span className="text-subtle">· {formatDate(active.at)}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Health score trend">
        {[25, 50, 75].map((y) => (
          <line key={y} x1={0} x2={w} y1={h - (y / 100) * h} y2={h - (y / 100) * h} stroke="var(--border)" strokeDasharray="2 4" />
        ))}
        {points.map((p, i) => {
          const bh = Math.max(3, (p.score / 100) * h);
          const color = p.score >= 85 ? "var(--accent)" : p.score >= 60 ? "var(--warning)" : "var(--danger)";
          return (
            <rect
              key={p.id}
              x={i * (bw + gap)}
              y={h - bh}
              width={bw}
              height={bh}
              rx={3}
              fill={color}
              opacity={hover == null || hover === i ? 0.9 : 0.35}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
    </div>
  );
}
