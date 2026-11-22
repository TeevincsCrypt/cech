import {
  ArrowRight,
  Bot,
  Bug,
  CheckCircle2,
  Compass,
  FileSearch,
  FlaskConical,
  FormInput,
  Globe,
  Globe2,
  LayoutGrid,
  LayoutTemplate,
  History,
  Plus,
  RotateCcw,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { CategoryFlower } from "@/components/app/category-flower";
import { HeatBar } from "@/components/app/heat-bar";
import { InspectionsTable } from "@/components/app/inspections-table";
import { Logo, LogoMark } from "@/components/app/logo";
import { StatRow } from "@/components/app/stat-row";
import { ExecutionBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InspectionListItem } from "@/lib/server/read-models";

const STEPS = [
  { icon: Globe2, title: "Submit a URL", body: "Pick what to inspect: navigation, forms, interface, user journeys." },
  { icon: Sparkles, title: "Groq plans the tests", body: "Objectives grounded in your page's real structure, not invented features." },
  { icon: Terminal, title: "Kane runs them for real", body: "Kane CLI opens a real browser, clicks, types and verifies each objective." },
  { icon: Bot, title: "Groq explains failures", body: "Actual Kane output becomes expected vs observed behaviour and a fix." },
  { icon: RotateCcw, title: "Fix, then verify", body: "Retest failed objectives. Kane independently confirms the fix worked." },
];

const CAPABILITIES = [
  { icon: Compass, title: "Navigation", items: ["Main navigation", "Internal links", "Broken links", "Redirects"] },
  { icon: FormInput, title: "Forms", items: ["Required fields", "Invalid input", "Validation feedback", "Safe submissions"] },
  { icon: LayoutTemplate, title: "Interface", items: ["Main headings", "Buttons", "Missing content", "Rendering"] },
  { icon: Route, title: "User journeys", items: ["Home → destination", "Primary CTA", "Shopping flows", "Safe interactions"] },
];

// Illustrative rows for the product preview only (clearly labelled on the page).
const EXAMPLE_ROWS: InspectionListItem[] = [
  { id: "ex-1", website_url: "https://shop.example.dev", created_at: "2026-06-21T10:00:00Z", completed_at: null, status: "completed", overall_status: "verified", health_score: 100, tests: 6, executed: 6, passed: 6, failed: 0, inconclusive: 0, errored: 0, runs: 2, resolved: 2, recurring: 0 },
  { id: "ex-2", website_url: "https://docs.example.dev", created_at: "2026-06-01T10:00:00Z", completed_at: null, status: "completed", overall_status: "issues_found", health_score: 58, tests: 5, executed: 5, passed: 3, failed: 2, inconclusive: 0, errored: 0, runs: 1, resolved: 0, recurring: 0 },
  { id: "ex-3", website_url: "https://www.example.org", created_at: "2026-05-16T10:00:00Z", completed_at: null, status: "completed", overall_status: "passed", health_score: 88, tests: 4, executed: 4, passed: 4, failed: 0, inconclusive: 0, errored: 0, runs: 1, resolved: 0, recurring: 0 },
];

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-[1080px]" aria-label="Example CECH dashboard with illustrative data">
      <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_40px_100px_-40px_rgb(40_30_80/0.35)]">
        <div className="flex">
          {/* rail */}
          <div className="hidden w-[72px] shrink-0 flex-col items-center gap-10 border-r border-border py-6 sm:flex" aria-hidden>
            <LogoMark className="size-11" />
            <div className="flex flex-col items-center gap-3 text-subtle">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--border-strong)]">
                <LayoutGrid className="size-[18px]" />
              </span>
              <span className="flex size-10 items-center justify-center">
                <Plus className="size-[18px]" />
              </span>
              <span className="flex size-10 items-center justify-center">
                <History className="size-[18px]" />
              </span>
              <span className="flex size-10 items-center justify-center">
                <Settings className="size-[18px]" />
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 p-6 sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-2xl font-semibold tracking-tight">Website Overview</p>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">Example · illustrative data</span>
            </div>
            <div className="mt-8 grid items-end gap-6 md:grid-cols-[200px_1fr] md:gap-10">
              <div>
                <p className="text-[76px] font-medium leading-[0.9] tracking-[-0.04em]">86</p>
                <p className="mt-2 text-sm text-muted">real browser tests executed</p>
              </div>
              <div className="pb-1">
                <p className="mb-3 text-sm text-muted">
                  <span className="mr-1.5 text-xl font-semibold text-accent">83%</span> of conclusive browser checks passed
                </p>
                <HeatBar value={83} label="71 passed" height={42} />
              </div>
            </div>
            <StatRow
              className="mt-8"
              items={[
                { label: "Total inspections", value: 14, tone: "neutral", icon: Globe },
                { label: "Issues detected", value: 15, tone: "red", icon: Bug, hint: "failed checks" },
                { label: "Fixes verified", value: 11, tone: "green", icon: ShieldCheck, hint: "by retest" },
              ]}
            />
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                <p className="text-lg font-semibold tracking-tight">Recent inspections</p>
                <div className="pointer-events-none mt-1">
                  <InspectionsTable items={EXAMPLE_ROWS} />
                </div>
              </div>
              <div className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
                <p className="text-lg font-semibold tracking-tight">Quality map</p>
                <CategoryFlower
                  className="mt-3"
                  metrics={[
                    { label: "Navigation", value: 92 },
                    { label: "Forms", value: 64 },
                    { label: "Fixes verified", value: 85 },
                    { label: "Journeys", value: 78 },
                    { label: "Conclusive", value: 94 },
                    { label: "Interface", value: 97 },
                  ]}
                  center={<ShieldCheck className="size-5 text-ink" strokeWidth={2.4} />}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, children, className }: { id?: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`rounded-[28px] bg-surface px-6 py-14 sm:px-12 sm:py-16 ${className ?? ""}`}>
      <p className="text-sm font-medium text-muted">{eyebrow}</p>
      <h2 className="mt-2 max-w-2xl text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-frame p-2 sm:p-4">
      <div className="mx-auto max-w-[1320px] space-y-2 sm:space-y-4">
        {/* Hero canvas */}
        <div className="overflow-hidden rounded-[28px] bg-surface">
          <header className="flex h-20 items-center justify-between px-5 sm:px-10">
            <Logo />
            <nav className="flex items-center gap-1 text-sm">
              <a href="#how" className="hidden rounded-full px-4 py-2 text-muted hover:bg-surface-2 hover:text-ink md:block">
                How it works
              </a>
              <a href="#kane" className="hidden rounded-full px-4 py-2 text-muted hover:bg-surface-2 hover:text-ink md:block">
                Verification
              </a>
              <Link href="/dashboard" className="hidden rounded-full px-4 py-2 text-muted hover:bg-surface-2 hover:text-ink sm:block">
                Dashboard
              </Link>
              <Button asChild className="ml-2">
                <Link href="/inspections/new">Inspect your website</Link>
              </Button>
            </nav>
          </header>

          <section className="relative px-5 pb-16 pt-14 sm:px-10 sm:pt-20">
            <div className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
            <div className="relative mx-auto max-w-4xl text-center">
              <Badge tone="outline" className="mx-auto px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-accent" /> AI-planned · Browser-verified
              </Badge>
              <h1 className="mt-7 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">
                Your website isn&apos;t launch-ready until it&apos;s verified.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted">
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
            </div>
            <ProductPreview />
          </section>
        </div>

        {/* How it works */}
        <Section id="how" eyebrow="How CECH works" title="A closed loop from plan to proof.">
          <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-border pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-[44px] font-medium leading-none tracking-tight text-border-strong">0{i + 1}</span>
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
                    <s.icon className="size-[18px]" />
                  </span>
                </div>
                <p className="mt-5 font-semibold">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Capabilities */}
        <Section eyebrow="Testing capabilities" title="Inspect what visitors actually do.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-3xl bg-surface-2 p-6">
                <span className="flex size-11 items-center justify-center rounded-full bg-surface">
                  <c.icon className="size-5" />
                </span>
                <p className="mt-6 text-lg font-semibold">{c.title}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.items.map((i) => (
                    <span key={i} className="rounded-full bg-surface px-3 py-1.5 text-xs text-muted">
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Kane verification */}
        <Section id="kane" eyebrow="Kane-powered verification" title="Evidence from a real browser. Not predictions.">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[17px] leading-relaxed text-muted">
                Every objective runs through Kane CLI by TestMu AI in a real Chrome browser. CECH stores Kane&apos;s actual verdict, step log and evidence reference. Groq interprets the result, but can never change it.
              </p>
              <ul className="mt-8 divide-y divide-border border-y border-border">
                {[
                  "Browser outcome and AI interpretation stored as separate layers",
                  "Infrastructure errors reported apart from website failures",
                  "Timeouts and blocked pages marked inconclusive, not broken",
                  "Raw Kane output preserved for debugging",
                ].map((x) => (
                  <li key={x} className="flex items-center gap-3 py-3.5 text-[15px]">
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-accent text-white">
                      <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
                    </span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-3xl bg-[#16151b] text-[#c9c8d3] shadow-[0_30px_80px_-40px_rgb(20_16_40/0.6)]">
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5 text-xs text-white/50">
                <Terminal className="size-3.5" /> Kane CLI agent-mode output (format)
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-relaxed scrollbar-thin">
                <span className="text-white/40">$ kane-cli run &quot;Go to https://site.dev and click Pricing…&quot; \{"\n"}    --url https://site.dev --agent --headless{"\n"}</span>
                {`{"step":1,"status":"done","remark":"Opened homepage"}\n`}
                {`{"step":2,"status":"done","remark":"Clicked 'Pricing' in nav"}\n`}
                {`{"step":3,"status":"failed","remark":"URL is /about, expected /pricing"}\n`}
                <span className="text-[#ff9a9a]">{`{"type":"run_end","status":"failed", …}`}</span>
              </pre>
            </div>
          </div>
        </Section>

        {/* Example report */}
        <Section eyebrow="Example inspection report" title="Two layers for every test.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-surface-2 p-7">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Globe2 className="size-4" /> Browser outcome · Kane
                </p>
                <ExecutionBadge status="FAILED" />
              </div>
              <p className="mt-5 text-[15px] leading-relaxed">The primary call-to-action was clicked, but the browser remained on the homepage.</p>
              <p className="mt-4 font-mono text-xs text-subtle">exit 1 · 4 steps · 18s · evidence pack linked</p>
            </div>
            <div className="rounded-3xl bg-surface-2 p-7">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-4" /> AI interpretation · Groq
              </p>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                <span className="text-ink">Expected:</span> “Start your free trial” opens the signup page. <span className="text-ink">Observed:</span> the click produced no navigation.
              </p>
              <p className="mt-4 rounded-2xl bg-surface p-4 text-sm">Check the button&apos;s href attribute and its click handler for an exception before navigation.</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-subtle">Illustrative example. Real reports show your site&apos;s actual Kane results.</p>
        </Section>

        {/* Why developers */}
        <Section eyebrow="Why developers use CECH" title="Honest answers before you hit deploy.">
          <div className="grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              { icon: FlaskConical, t: "No test code to write", b: "Plain-English objectives, generated from your actual pages and run immediately." },
              { icon: FileSearch, t: "Honest results", b: "Pass means Kane saw it work. Unknown stays unknown. No score is ever a guarantee." },
              { icon: ShieldCheck, t: "Proof your fix worked", b: "Retest failed objectives and keep a verification history for every launch." },
            ].map((x) => (
              <div key={x.t} className="py-8 md:px-8 md:first:pl-0">
                <x.icon className="size-5" />
                <p className="mt-4 text-lg font-semibold">{x.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{x.b}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-20 text-center text-white sm:px-12">
          <div className="bg-heat pointer-events-none absolute -bottom-24 left-1/2 h-40 w-[80%] -translate-x-1/2 rounded-full opacity-50 blur-3xl" aria-hidden />
          <LogoMark onDark className="relative mx-auto mb-8 size-24 drop-shadow-[0_12px_30px_rgb(47_191_107/0.35)]" />
          <h2 className="relative text-[34px] font-semibold tracking-tight sm:text-[52px]">Don&apos;t just launch. Prove it works.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/60">Run your first inspection in under a minute, or try it on the built-in demo website.</p>
          <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-ink hover:bg-white/90">
              <Link href="/inspections/new">
                Inspect Your Website <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white">
              <Link href="/demo">Open the demo website</Link>
            </Button>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:flex-row">
          <Logo />
          <p>AI planning by Groq · Browser verification by Kane CLI (TestMu AI)</p>
        </footer>
      </div>
    </div>
  );
}
