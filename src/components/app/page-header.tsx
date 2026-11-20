"use client";
import { FlaskConical, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

function SearchPill() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/inspections?q=${encodeURIComponent(q.trim())}` : "/inspections");
      }}
      className="relative hidden w-64 md:block"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search inspections…"
        aria-label="Search inspections by website"
        className="h-10 w-full rounded-full border border-border-strong bg-surface pl-4 pr-10 text-sm placeholder:text-subtle focus:border-ink focus:outline-none"
      />
      <button type="submit" aria-label="Search" className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink">
        <Search className="size-[18px]" />
      </button>
    </form>
  );
}

/** Top bar: page title, search, round icon actions and the primary pill CTA. */
export function PageHeader({
  title,
  description,
  actions,
  cta = true,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  cta?: boolean;
}) {
  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">{title}</h1>
        <SearchPill />
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {actions}
          <Tooltip content="Demo website">
            <IconButton asChild>
              <a href="/demo" target="_blank" rel="noreferrer" aria-label="Open demo website">
                <FlaskConical />
              </a>
            </IconButton>
          </Tooltip>
          <Tooltip content="Settings">
            <IconButton asChild>
              <Link href="/settings" aria-label="Settings">
                <Settings />
              </Link>
            </IconButton>
          </Tooltip>
          {cta && (
            <Button asChild>
              <Link href="/inspections/new">
                <Plus /> New inspection
              </Link>
            </Button>
          )}
        </div>
      </div>
      {description && <p className="mt-2 text-sm text-muted">{description}</p>}
    </div>
  );
}
