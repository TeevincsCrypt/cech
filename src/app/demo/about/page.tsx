import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "About — Quillstack" } };

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">About Quillstack</h1>
      <p className="mt-4 text-slate-600">
        Quillstack started in 2024 when a small product team got tired of losing decisions in chat threads. Today it helps teams of every size keep a single, searchable record of
        what they agreed and why.
      </p>
      <h2 className="mt-10 text-xl font-semibold">Our principles</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-600">
        <li>Writing is thinking. We build tools that make writing easier.</li>
        <li>Your notes are yours. Export everything, any time.</li>
        <li>Fast beats fancy.</li>
      </ul>
    </section>
  );
}
