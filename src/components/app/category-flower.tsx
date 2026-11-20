"use client";
import { useId } from "react";
import { heatColor } from "@/lib/heat";
import { cn } from "@/lib/utils";

export interface FlowerMetric {
  label: string;
  /** 0–100, or null when there is no data yet. */
  value: number | null;
  hint?: string;
}

const CX = 160;
const CY = 160;
const RING = 100;
const HEX = 49;

function hexPoints(cx: number, cy: number, r: number, rot: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((rot + 60 * k) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/**
 * Hexagonal "flower" of up to six metrics around a centre mark. Each petal's
 * blurred heat blob is coloured by its real value; empty metrics stay grey.
 */
export function CategoryFlower({ metrics, center, className }: { metrics: FlowerMetric[]; center?: React.ReactNode; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const petals = metrics.slice(0, 6).map((m, i) => {
    const angle = -90 + i * 60;
    const rad = (angle * Math.PI) / 180;
    return { ...m, x: CX + RING * Math.cos(rad), y: CY + RING * Math.sin(rad), rot: angle + 30 };
  });

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[320px]", className)}>
      <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={metrics.map((m) => `${m.label}: ${m.value ?? "no data"}%`).join(", ")}>
        <defs>
          <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="17" />
          </filter>
          <clipPath id={`clip-${uid}`}>
            {petals.map((p) => (
              <polygon key={p.label} points={hexPoints(p.x, p.y, HEX + 4, p.rot)} />
            ))}
            <circle cx={CX} cy={CY} r={RING - HEX + 4} />
          </clipPath>
        </defs>

        {petals.map((p) => (
          <polygon key={`f-${p.label}`} points={hexPoints(p.x, p.y, HEX, p.rot)} fill="#f2f1f7" stroke="#f2f1f7" strokeWidth="10" strokeLinejoin="round" />
        ))}

        <g clipPath={`url(#clip-${uid})`}>
          {petals.map((p) =>
            p.value == null ? null : (
              <circle
                key={`b-${p.label}`}
                cx={(p.x + CX) / 2 + (p.x - CX) * 0.25}
                cy={(p.y + CY) / 2 + (p.y - CY) * 0.25}
                r={44}
                fill={heatColor(p.value)}
                filter={`url(#blur-${uid})`}
                opacity={0.95}
              />
            ),
          )}
        </g>

        {petals.map((p) => (
          <polygon key={`o-${p.label}`} points={hexPoints(p.x, p.y, HEX, p.rot)} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" strokeOpacity="0.9" />
        ))}

        <circle cx={CX} cy={CY} r={21} fill="#ffffff" />

        {petals.map((p) => (
          <g key={`t-${p.label}`}>
            <text x={p.x} y={p.y - 2} textAnchor="middle" className="fill-[var(--ink)]" style={{ fontSize: 15, fontWeight: 600 }}>
              {p.value == null ? "—" : `${Math.round(p.value)}%`}
            </text>
            <text x={p.x} y={p.y + 14} textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: 10.5 }}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      {center && <div className="absolute left-1/2 top-1/2 flex size-[42px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">{center}</div>}
    </div>
  );
}
