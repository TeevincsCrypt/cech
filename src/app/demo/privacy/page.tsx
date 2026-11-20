import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Privacy policy — Quillstack" } };

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-4 text-slate-600">Quillstack is a fictional company used to demonstrate CECH. This demo does not collect or store personal data.</p>
    </section>
  );
}
