import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Inspection Report" };

export default function ReportPage({ params }: PageProps<"/inspections/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading inspection report…" />}>
      <ReportView params={params} />
    </Suspense>
  );
}
