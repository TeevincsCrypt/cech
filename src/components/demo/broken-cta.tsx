"use client";

/**
 * Intentional defect for BROKEN mode: looks like the primary CTA but its
 * click handler throws before navigating, so nothing happens.
 */
export function BrokenCta({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        try {
          const plan = (window as unknown as { __quillstackPlan?: { trial: { url: string } } }).__quillstackPlan;
          window.location.assign(plan!.trial.url); // plan is undefined → TypeError
        } catch (err) {
          console.error("Trial CTA failed:", err);
        }
      }}
    >
      {children}
    </button>
  );
}
