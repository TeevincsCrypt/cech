import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  FileSearch,
  FlaskConical,
  FormInput,
  Globe2,
  LayoutTemplate,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { HealthRing } from "@/components/app/health-ring";
import { Logo } from "@/components/app/logo";
import { ExecutionBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Globe2, title: "Submit a URL", body: "Pick what to inspect: navigation, forms, interface, user journeys." },
  { icon: Sparkles, title: "Groq plans the tests", body: "Testing objectives grounded in your page's real structure, not invented features." },
  { icon: Terminal, title: "Kane runs them for real", body: "Kane CLI opens a real browser, clicks, types and verifies each objective." },
  { icon: Bot, title: "Groq explains failures", body: "Actual Kane output becomes expected vs observed behaviour and a recommended fix." },
  { icon: RotateCcw, title: "Fix, then verify", body: "Retest failed objectives. Kane independently confirms the fix worked." },
];

const CAPABILITIES = [
  { icon: Compass, title: "Navigation", items: ["Main navigation", "Internal & broken links", "Redirects & page loads"] },
  { icon: FormInput, title: "Forms", items: ["Required fields & invalid input", "Visible validation feedback", "Safe submissions with fake data"] },
  { icon: LayoutTemplate, title: "Interface", items: ["Headings & primary content", "Buttons & visible elements", "Missing or broken rendering"] },
  { icon: Route, title: "User journeys", items: ["Homepage → key destination", "Primary CTA flows", "Shopping up to checkout"] },
];

function Preview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl text-left">
      <div className="absolute -inset-x-10 -top-10 bottom-0 bg-[radial-gradient(ellipse_at_top,rgb(61_220_132/0.12),transparent_60%)]" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
          </div>
          <span className="text-xs text-subtle">Example report · illustrative data</span>
          <span />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">Inspection Report</span>
              <Badge tone="red">
                <XCircle className="size-3.5" /> Issues found
              </Badge>
            </div>
            {[
              { t: "Primary navigation reaches Pricing", s: "FAILED" as const, n: "Clicked “Pricing” but landed on /about." },
              { t: "Contact form shows a confirmation", s: "FAILED" as const, n: "Submitted; no confirmation message appeared." },
              { t: "Homepage renders main heading", s: "PASSED" as const, n: "Heading visible, primary content rendered." },
              { t: "Main CTA reaches signup", s: "PASSED" as const, n: "Navigated to /signup with form visible." },
            ].map((r) => (
              <div key={r.t} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.t}</p>
                  <p className="mt-0.5 text-xs text-muted">{r.n}</p>
                </div>
                <ExecutionBadge status={r.s} />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-2 p-5">
            <HealthRing score={50} />
            <p className="text-center text-xs text-muted">Weighted by test priority. Only conclusive Kane verdicts count.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-foreground sm:block">
              How it works
            </a>
            <a href="#kane" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-foreground sm:block">
              Verification
            </a>
            <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-muted hover:text-foreground">
              Dashboard
            </Link>
            <Button asChild size="sm" className="ml-2">
              <Link href="/inspections/new">Inspect your website</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* 1. Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
            <Badge tone="green" className="mx-auto">
              <ShieldCheck className="size-3.5" /> AI-planned. Browser-verified.
            </Badge>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Your website isn&apos;t launch-ready until it&apos;s verified.</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
              CECH uses AI and real browser automation to discover broken interactions, verify critical user journeys and help developers ship with confidence.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/inspections/new">
                  Inspect Your Website <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how">See How It Works</a>
              </Button>
            </div>
            <Preview />
          </div>
        </section>

        {/* 2. How it works */}
        <section id="how" className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">How CECH works</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">A closed loop from plan to proof.</h2>
            <ol className="mt-10 grid gap-3 md:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <s.icon className="size-5 text-accent" />
                    <span className="font-mono text-xs text-subtle">0{i + 1}</span>
                  </div>
                  <p className="mt-4 text-sm font-medium">{s.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. Capabilities */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Testing capabilities</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Inspect what visitors actually do.</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-surface p-6">
                <c.icon className="size-5 text-muted" />
                <p className="mt-4 font-medium">{c.title}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted">
                  {c.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" /> {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Kane verification */}
        <section id="kane" className="border-y border-border bg-surface/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-accent">Kane-powered verification</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Evidence from a real browser. Not predictions.</h2>
              <p className="mt-4 text-muted">
                Every objective runs through Kane CLI by TestMu AI in a real Chrome browser. CECH stores Kane&apos;s actual verdict, step log and evidence reference. Groq interprets the result, but it can never change it.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Browser outcome and AI interpretation stored as separate layers",
                  "Infrastructure errors reported apart from website failures",
                  "Timeouts and blocked pages marked inconclusive, not broken",
                  "Raw Kane output preserved for debugging",
                ].map((x) => (
                  <li key={x} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border border-border-strong bg-background">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-subtle">
                <Terminal className="size-3.5" /> Kane CLI agent-mode output (format)
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed text-muted scrollbar-thin">
                <span className="text-subtle">$ kane-cli run &quot;Go to https://site.dev and click Pricing…&quot; \{"\n"}    --url https://site.dev --agent --headless{"\n"}</span>
                {`{"step":1,"status":"done","remark":"Opened homepage"}\n`}
                {`{"step":2,"status":"done","remark":"Clicked 'Pricing' in nav"}\n`}
                {`{"step":3,"status":"failed","remark":"URL is /about, expected /pricing"}\n`}
                <span className="text-danger">{`{"type":"run_end","status":"failed", …}`}</span>
              </pre>
            </div>
          </div>
        </section>

        {/* 5. Example report */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Example inspection report</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Two layers for every test.</h2>
          <div className="mt-10 grid gap-4 rounded-2xl border border-border bg-surface p-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Globe2 className="size-4 text-muted" /> Browser outcome · Kane
                </p>
                <ExecutionBadge status="FAILED" />
              </div>
              <p className="text-sm text-muted">The primary call-to-action was clicked, but the browser remained on the homepage.</p>
              <p className="font-mono text-xs text-subtle">exit 1 · 4 steps · 18s · evidence pack linked</p>
            </div>
            <div className="space-y-3 lg:border-l lg:border-border lg:pl-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Bot className="size-4 text-muted" /> AI interpretation · Groq
              </p>
              <p className="text-sm text-muted">
                <span className="text-foreground">Expected:</span> “Start your free trial” opens the signup page.
                <br />
                <span className="text-foreground">Observed:</span> the click produced no navigation.
              </p>
              <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm">Check the button&apos;s href attribute and its click event handler for an exception before navigation.</p>
            </div>
            <p className="text-xs text-subtle lg:col-span-2">Illustrative example. Real reports show your site&apos;s actual Kane results.</p>
          </div>
        </section>

        {/* 6. Why developers */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">Why developers use CECH</p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                { icon: FlaskConical, t: "No test code to write", b: "Plain-English objectives, generated from your actual pages and run immediately." },
                { icon: FileSearch, t: "Honest results", b: "Pass means Kane saw it work. Unknown stays unknown. No score is ever a guarantee." },
                { icon: RotateCcw, t: "Proof your fix worked", b: "Retest failed objectives and keep a verification history for every launch." },
              ].map((x) => (
                <div key={x.t}>
                  <x.icon className="size-5 text-accent" />
                  <p className="mt-3 font-medium">{x.t}</p>
                  <p className="mt-1.5 text-sm text-muted">{x.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Don&apos;t just launch. Prove it works.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">Run your first inspection in under a minute, or try it on the built-in demo website.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/inspections/new">
                Inspect Your Website <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/demo">Open the demo website</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-subtle sm:flex-row sm:px-6">
          <Logo />
          <p>AI planning by Groq · Browser verification by Kane CLI (TestMu AI)</p>
        </div>
      </footer>
    </div>
  );
}
