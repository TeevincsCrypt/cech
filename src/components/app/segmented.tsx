"use client";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-full border border-border-strong bg-surface p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-full px-4 py-1.5 text-sm transition-colors", value === o.value ? "bg-ink text-white" : "text-muted hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
