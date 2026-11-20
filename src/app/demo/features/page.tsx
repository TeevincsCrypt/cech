import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { absolute: "Features — Quillstack" } };

const FEATURES = [
  ["Meeting notes", "Agenda templates, action items and automatic follow-up summaries."],
  ["Specs & docs", "Long-form documents with comments, versions and linked decisions."],
  ["Search everything", "Full-text search across every workspace you belong to."],
  ["Integrations", "Calendar, chat and issue tracker integrations keep context in sync."],
  ["Offline sync", "Keep writing on a plane; changes merge when you reconnect."],
  ["Admin controls", "SSO, audit logs and per-workspace permissions on Business plans."],
];

export default function FeaturesPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Features</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Everything your team needs to capture decisions and keep work moving.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </div>
      <Link href="/demo/pricing" className="mt-10 inline-block text-sm font-medium text-indigo-600 hover:underline">Compare plans →</Link>
    </section>
  );
}
