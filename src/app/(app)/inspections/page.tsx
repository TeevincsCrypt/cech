import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { HistoryView } from "./history-view";

export const metadata: Metadata = { title: "Inspection History" };

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading history…" />}>
      <HistoryView />
    </Suspense>
  );
}
