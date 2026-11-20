import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Start your free trial — Quillstack" } };

export default function SignupPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Start your free trial</h1>
      <p className="mt-3 text-slate-600">Create your workspace. 14 days free, no credit card required.</p>
      <form className="mt-8 space-y-4" aria-label="Trial signup form" action="/demo/signup">
        <div>
          <label htmlFor="workspace" className="text-sm font-medium">Workspace name</label>
          <input id="workspace" name="workspace" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="work-email" className="text-sm font-medium">Work email</label>
          <input id="work-email" name="email" type="email" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <button type="button" className="h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500">Create workspace</button>
      </form>
    </section>
  );
}
