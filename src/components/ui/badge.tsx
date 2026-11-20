import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      green: "bg-accent-soft text-accent",
      red: "bg-danger-soft text-danger",
      yellow: "bg-warning-soft text-warning",
      blue: "bg-info-soft text-info",
      grey: "bg-neutral-soft text-muted",
      outline: "border border-border-strong text-muted",
    },
  },
  defaultVariants: { tone: "grey" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
