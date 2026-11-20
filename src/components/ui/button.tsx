import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink-hover",
        secondary: "border border-border-strong bg-surface text-foreground hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        outline: "border border-border-strong bg-surface text-foreground hover:bg-surface-2",
        success: "bg-accent text-white hover:bg-accent-strong",
        danger: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        md: "h-10 px-5",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** Round bordered icon button (top bar style). */
export function IconButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { asChild, ...rest } = props as { asChild?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>;
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

export { buttonVariants };
