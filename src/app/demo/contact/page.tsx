import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/components/demo/contact-form";
import { getDemoMode } from "@/lib/server/demo";

export const metadata: Metadata = { title: { absolute: "Contact us — Quillstack" } };

async function Form() {
  const mode = await getDemoMode();
  return <ContactForm endpoint={mode === "broken" ? "/api/demo/contact-submit" : "/api/demo/contact"} />;
}

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-5xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact us</h1>
        <p className="mt-3 text-slate-600">Questions about plans, security or onboarding? Send us a message and the team will get back to you.</p>
        <dl className="mt-8 space-y-3 text-sm">
          <div><dt className="font-medium">Sales</dt><dd className="text-slate-600">Typically replies within a day</dd></div>
          <div><dt className="font-medium">Support</dt><dd className="text-slate-600">Available Monday–Friday</dd></div>
        </dl>
      </div>
      <div className="rounded-2xl border border-slate-200 p-6 shadow-sm">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-slate-100" />}>
          <Form />
        </Suspense>
      </div>
    </section>
  );
}
