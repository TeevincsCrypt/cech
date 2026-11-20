import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#111316" stroke="#2f343c" />
      <path d="M15.5 8.2A5 5 0 1 0 15.5 15.8" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.2 12.1l1.7 1.7 3.6-3.8" fill="none" stroke="#3ddc84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[15px]">CECH</span>
    </Link>
  );
}
