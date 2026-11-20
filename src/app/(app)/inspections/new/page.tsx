import type { Metadata } from "next";
import { NewInspectionForm } from "./new-inspection-form";

export const metadata: Metadata = { title: "New Inspection" };

export default function NewInspectionPage() {
  return <NewInspectionForm />;
}
