import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoFooter, DemoHeader, DemoHeaderFallback } from "@/components/demo/demo-chrome";

export const metadata: Metadata = {
  title: { absolute: "Quillstack — Shared notes for fast-moving teams" },
  robots: { index: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 [color-scheme:light]">
      <Suspense fallback={<DemoHeaderFallback />}>
        <DemoHeader />
      </Suspense>
      <main className="flex-1">{children}</main>
      <DemoFooter />
    </div>
  );
}
