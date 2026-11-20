import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { absolute: "Pricing — Quillstack" } };

const PLANS = [
  { name: "Starter", price: "$0", desc: "For individuals getting organised", items: ["Up to 3 members", "100 notes", "Basic search"] },
  { name: "Team", price: "$8", desc: "Per user / month, billed annually", items: ["Unlimited notes", "Linked documents", "Integrations"], featured: true },
  { name: "Business", price: "$16", desc: "Per user / month, billed annually", items: ["SSO & audit logs", "Admin controls", "Priority support"] },
];

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-3 text-slate-600">Simple plans that grow with your team. Every plan starts with a 14-day free trial.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.name} className={`rounded-2xl border p-6 ${p.featured ? "border-indigo-500 shadow-md" : "border-slate-200"}`}>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="mt-3 text-4xl font-bold">{p.price}</p>
            <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-700">
              {p.items.map((i) => (<li key={i}>✓ {i}</li>))}
            </ul>
            <Link href="/demo/signup" className="mt-6 block rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500">Choose {p.name}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
