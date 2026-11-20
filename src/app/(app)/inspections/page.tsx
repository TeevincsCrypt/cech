import type { Metadata } from "next";
import { HistoryView } from "./history-view";

export const metadata: Metadata = { title: "Inspection History" };

export default function HistoryPage() {
  return <HistoryView />;
}
