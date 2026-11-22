"use client";
import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Official CECH mark: a pinched "C" frame (open on the right) holding a
 * crown with an inner "c", plus a sparkle in the opening.
 * Source artwork: public/brand/cech-logo.svg (keep in sync).
 */
export function LogoMark({ className, onDark = false, title = "CECH" }: { className?: string; onDark?: boolean; title?: string }) {
  const id = useId().replace(/:/g, "");
  const frame = onDark ? ["#ffffff", "#cfced8", "#f4f4f7"] : ["#3a3a44", "#111114", "#26262e"];
  return (
    <svg viewBox="142 45 500 500" className={cn("size-8 shrink-0", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`f-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={frame[0]} />
          <stop offset="0.55" stopColor={frame[1]} />
          <stop offset="1" stopColor={frame[2]} />
        </linearGradient>
        <linearGradient id={`c-${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#7ee6a4" />
          <stop offset="0.5" stopColor="#2fbf6b" />
          <stop offset="1" stopColor="#1a8a4a" />
        </linearGradient>
        <mask id={`m-${id}`}>
          <rect x="142" y="45" width="500" height="500" fill="#fff" />
          <rect x="470" y="205" width="170" height="170" fill="#000" />
        </mask>
      </defs>
      <path
        mask={`url(#m-${id})`}
        fill={`url(#f-${id})`}
        fillRule="evenodd"
        d="M200 62 Q392 92 585 62 Q555 295 585 528 Q392 498 200 528 Q230 295 200 62 Z M258 120 Q392 142 527 120 Q500 295 527 470 Q392 448 258 470 Q284 295 258 120 Z"
      />
      <path
        fill={`url(#c-${id})`}
        fillRule="evenodd"
        d="M298 438 C305 380 318 330 316 272 C315 250 316 235 320 222 C330 240 338 255 344 268 L355 238 L387 206 L419 238 L430 268 C437 255 446 240 458 222 C462 236 463 250 462 272 C460 330 474 380 482 438 Q390 428 298 438 Z M387 236 a9 9 0 1 0 0.01 0 Z"
      />
      <path d="M405 324 A18 25 0 1 0 405 366" fill="none" stroke="#ffffff" strokeWidth="15" strokeLinecap="round" />
      <path fill={onDark ? "#7ee6a4" : "#2fbf6b"} d="M522 262 Q526 281 545 286 Q526 291 522 310 Q518 291 499 286 Q518 281 522 262 Z" />
    </svg>
  );
}

export function Logo({ href = "/", className, showText = true, onDark = false }: { href?: string; className?: string; showText?: boolean; onDark?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="CECH home">
      <LogoMark className="size-9" onDark={onDark} title="" />
      {showText && <span className={cn("text-[18px] tracking-[0.02em]", onDark && "text-white")}>CECH</span>}
    </Link>
  );
}
