"use client";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

/**
 * Demo contact form. In BROKEN mode it posts to an endpoint that doesn't exist
 * and silently swallows the error, so the visitor never sees a confirmation.
 */
export function ContactForm({ endpoint }: { endpoint: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), message: String(form.get("message") ?? "") };
    if (!payload.name.trim() || !payload.email.trim() || !payload.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setError(null);
    setState("sending");
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          setError(body.error ?? "Please check the form.");
          setState("idle");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      setName(payload.name);
      setReference(body.reference);
      setState("sent");
    } catch (err) {
      console.error("contact submit failed", err); // swallowed: no feedback to the visitor
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <CheckCircle2 className="size-6 text-emerald-600" />
        <p className="mt-3 text-lg font-semibold text-emerald-900">Thanks, {name}! Your message has been sent.</p>
        <p className="mt-1 text-sm text-emerald-800">We usually reply within one business day. Reference: {reference}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Contact form">
      <div>
        <label htmlFor="name" className="text-sm font-medium">Name *</label>
        <input id="name" name="name" required className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-medium">Email *</label>
        <input id="email" name="email" type="email" required className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>
      <div>
        <label htmlFor="message" className="text-sm font-medium">Message *</label>
        <textarea id="message" name="message" required rows={5} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={state === "sending"} className="h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
