"use client";
import { BookOpen, FlaskConical, History, LayoutGrid, Menu, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo, LogoMark } from "@/components/app/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/inspections/new", label: "New Inspection", icon: Plus },
  { href: "/inspections", label: "Inspection History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/inspections") return pathname === "/inspections" || (/^\/inspections\/[^/]+$/.test(pathname) && pathname !== "/inspections/new");
  return pathname === href;
}

/** Slim icon rail (desktop). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <div className="hidden w-[84px] shrink-0 border-r border-border lg:block">
    <aside className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center justify-between py-7">
      <div className="flex flex-col items-center gap-14">
        <Link href="/" aria-label="CECH home">
          <LogoMark className="size-9" />
        </Link>
        <nav className="flex flex-col items-center gap-3" aria-label="App">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Tooltip key={href} content={label} side="right">
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors",
                    active ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-subtle hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon className="size-[19px]" strokeWidth={active ? 2.3 : 2} />
                </Link>
              </Tooltip>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col items-center gap-3 border-t border-border pt-6">
        <Tooltip content="Open demo website" side="right">
          <a href="/demo" target="_blank" rel="noreferrer" aria-label="Open demo website" className="flex size-11 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-ink">
            <FlaskConical className="size-[19px]" />
          </a>
        </Tooltip>
        <Tooltip content="Landing page" side="right">
          <Link href="/" aria-label="Landing page" className="flex size-11 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-ink">
            <BookOpen className="size-[19px]" />
          </Link>
        </Tooltip>
      </div>
    </aside>
    </div>
  );
}

/** Mobile header + drawer. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button onClick={() => setOpen(true)} className="flex size-10 items-center justify-center rounded-full border border-border-strong text-muted" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#1b1a22]/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-3 w-[calc(100%-1.5rem)] max-w-sm rounded-3xl bg-surface p-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <Logo href="/dashboard" />
              <button onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full border border-border-strong text-muted" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-6 flex flex-col gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn("flex items-center gap-3 rounded-2xl px-4 py-3 text-sm", isActive(pathname, href) ? "bg-surface-2 font-medium text-ink" : "text-muted")}
                >
                  <Icon className="size-[18px]" /> {label}
                </Link>
              ))}
              <a href="/demo" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted">
                <FlaskConical className="size-[18px]" /> Demo website
              </a>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
