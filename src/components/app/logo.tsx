import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#111114" />
      <path d="M20.6 11.1a6.5 6.5 0 1 0 0 9.8" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13.2 16.1l2.2 2.2 4.6-4.9" fill="none" stroke="#5fdc8c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className, showText = true }: { href?: string; className?: string; showText?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)} aria-label="CECH home">
      <LogoMark />
      {showText && <span className="text-[17px]">CECH</span>}
    </Link>
  );
}
