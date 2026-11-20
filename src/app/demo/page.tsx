import { ArrowRight, Check, Layers, Lock, Zap } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BrokenCta } from "@/components/demo/broken-cta";
import { getDemoMode } from "@/lib/server/demo";

const ctaClass =
  "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500";

async function PrimaryCta() {
  const mode = await getDemoMode();
  const label = (
    <>
      Start your free trial <ArrowRight className="size-4" />
    </>
  );
  return mode === "broken" ? (
    <BrokenCta className={ctaClass}>{label}</BrokenCta>
  ) : (
    <Link href="/demo/signup" className={ctaClass}>
      {label}
    </Link>
  );
}

export default function DemoHome() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6">
        <p className="mx-auto w-fit rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">New: offline sync for every plan</p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Shared notes for fast-moving teams</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
          Quillstack keeps meeting notes, specs and decisions in one searchable place, so your team always knows what was agreed.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Suspense fallback={<span className={`${ctaClass} opacity-60`}>Start your free trial</span>}>
            <PrimaryCta />
          </Suspense>
          <Link href="/demo/features" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            See how it works
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">14-day free trial · No credit card required</p>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-3 sm:px-6">
          {[
            { icon: Zap, title: "Instant search", body: "Find any note, decision or action item in milliseconds." },
            { icon: Layers, title: "Linked documents", body: "Connect specs to the meetings where they were decided." },
            { icon: Lock, title: "Private by default", body: "Granular sharing with workspace-level access controls." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <f.icon className="size-5 text-indigo-600" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Why teams switch to Quillstack</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {["Templates for standups, retros and specs", "Real-time collaboration with presence", "Integrates with your calendar", "Export to Markdown at any time"].map((x) => (
            <li key={x} className="flex items-center gap-2 text-slate-700">
              <Check className="size-4 text-emerald-600" /> {x}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
