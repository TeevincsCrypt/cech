import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-full border border-border-strong bg-surface px-5 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-ink focus:outline-none focus:ring-4 focus:ring-ink/5 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border border-border-strong bg-surface px-5 py-4 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-ink focus:outline-none focus:ring-4 focus:ring-ink/5",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
