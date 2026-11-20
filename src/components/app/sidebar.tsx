"use client";
import { History, LayoutDashboard, Menu, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/inspections/new", label: "New Inspection", icon: Plus },
  { href: "/inspections", label: "Inspection History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/inspections") return pathname === "/inspections" || (/^\/inspections\/[^/]+$/.test(pathname) && pathname !== "/inspections/new");
  return pathname === href;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-surface-3 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-accent")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
      <p className="font-medium text-foreground">Built-in demo site</p>
      <p className="mt-1">Inspect a site with switchable healthy/broken behaviour.</p>
      <Link href="/demo" target="_blank" className="mt-2 inline-block text-accent hover:underline">
        Open demo website →
      </Link>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-border bg-surface px-3 py-5 lg:flex">
        <div className="space-y-6">
          <Logo href="/dashboard" className="px-2" />
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-muted hover:bg-surface-2" aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col justify-between border-r border-border bg-surface p-4 animate-fade-in">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Logo href="/dashboard" />
                <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Close navigation">
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </div>
      )}
    </>
  );
}
