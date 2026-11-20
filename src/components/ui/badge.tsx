import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      green: "bg-accent-soft text-accent-strong",
      red: "bg-danger-soft text-danger",
      yellow: "bg-warning-soft text-warning",
      blue: "bg-info-soft text-info",
      grey: "bg-neutral-soft text-muted",
      outline: "bg-surface-2 text-foreground",
    },
  },
  defaultVariants: { tone: "grey" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
