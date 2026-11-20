import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Documentation — Quillstack" } };

export default function DocsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
      <p className="mt-4 text-slate-600">Guides for getting started, inviting your team and connecting integrations.</p>
      <ol className="mt-8 list-decimal space-y-2 pl-5 text-slate-700">
        <li>Create a workspace</li>
        <li>Invite teammates</li>
        <li>Pick a template for your first meeting</li>
      </ol>
    </section>
  );
}
