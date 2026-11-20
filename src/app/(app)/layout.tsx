import { Suspense } from "react";
import { MobileNav, Sidebar } from "@/components/app/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-frame lg:p-4">
      <div className="flex min-h-screen flex-col bg-surface lg:min-h-[calc(100vh-2rem)] lg:flex-row lg:rounded-[28px] lg:shadow-[0_1px_0_rgb(20_16_40/0.04),0_30px_60px_-30px_rgb(20_16_40/0.15)]">
        <Suspense fallback={<div className="hidden w-[84px] shrink-0 border-r border-border lg:block" />}>
          <Sidebar />
          <MobileNav />
        </Suspense>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-8 lg:px-12 lg:py-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
