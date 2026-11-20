import { heatColor } from "@/lib/heat";
import { cn } from "@/lib/utils";

/** Monogram tile for a website (stands in for the avatar in list rows). */
export function SiteTile({ url, score, className }: { url: string; score?: number | null; className?: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const letter = host.charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-sm font-semibold text-ink", className)}
      aria-hidden
    >
      {score != null && <span className="absolute inset-0 opacity-60 blur-md" style={{ background: heatColor(score) }} />}
      <span className="relative">{letter}</span>
    </span>
  );
}
