"use client";
import { ArrowRight, Globe, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DemoModePanel } from "@/components/app/demo-mode-panel";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label, Textarea } from "@/components/ui/input";
import { CATEGORY_DETAILS } from "@/lib/categories";
import { TEST_CATEGORIES, type TestCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

function clientValidate(url: string): string | null {
  if (!url.trim()) return "Enter a website URL.";
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "Enter a full URL including https://";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Only http:// and https:// URLs can be inspected.";
  return null;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[180px_1fr]">
      <div className="flex items-center gap-3 md:block">
        <span className="flex size-7 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-xs font-semibold tabular-nums text-muted">{n}</span>
        <p className="text-sm font-medium md:mt-3">{title}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function NewInspectionForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [categories, setCategories] = useState<TestCategory[]>(["navigation", "forms", "interface", "journey"]);
  const [instructions, setInstructions] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (c: TestCategory) => setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = clientValidate(url);
    setUrlError(v);
    if (v) return;
    if (categories.length === 0) {
      setFormError("Select at least one testing category.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), categories, instructions: instructions.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.field === "url") setUrlError(body.error);
        else setFormError(body.error ?? "Could not start the inspection.");
        setSubmitting(false);
        return;
      }
      router.push(`/inspections/${body.id}`);
    } catch {
      setFormError("Network error — could not reach CECH.");
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="New Inspection" description="Groq plans the tests. Kane executes them in a real browser. You get evidence, not guesses." />
      <form onSubmit={submit} noValidate>
        <Card>
          <CardContent className="space-y-10 p-6 sm:p-8">
            <Step n={1} title="Website URL">
              <Label htmlFor="url" className="sr-only">
                Enter your website URL
              </Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <Input
                  id="url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  aria-invalid={Boolean(urlError)}
                  aria-describedby="url-help"
                  className="pl-10"
                />
              </div>
              <p id="url-help" className={cn("mt-2 text-xs", urlError ? "text-danger" : "text-subtle")}>
                {urlError ?? "Enter your website URL. Public http(s) sites only — private and internal addresses are blocked."}
              </p>
              <div className="mt-4">
                <DemoModePanel
                  onUseDemo={(u) => {
                    setUrl(u);
                    setUrlError(null);
                  }}
                />
              </div>
            </Step>

            <Step n={2} title="Testing categories">
              <div className="grid gap-3 sm:grid-cols-2">
                {TEST_CATEGORIES.map((c) => {
                  const d = CATEGORY_DETAILS[c];
                  const on = categories.includes(c);
                  const Icon = d.icon;
                  return (
                    <label
                      key={c}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                        on ? "border-accent/60 bg-accent-soft/40" : "border-border bg-surface-2 hover:border-border-strong",
                      )}
                    >
                      <Checkbox checked={on} onCheckedChange={() => toggle(c)} className="mt-0.5" aria-label={d.title} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Icon className={cn("size-4", on ? "text-accent" : "text-muted")} /> {d.title}
                        </p>
                        <ul className="mt-2 space-y-0.5 text-xs text-muted">
                          {d.items.map((i) => (
                            <li key={i}>· {i}</li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Step>

            <Step n={3} title="Optional instructions">
              <Label htmlFor="instructions" className="mb-2 block text-muted">
                Anything specific you want CECH to check?
              </Label>
              <Textarea
                id="instructions"
                maxLength={1000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Check whether visitors can successfully navigate from the homepage to the pricing page."
              />
              <p className="mt-1.5 text-right text-xs text-subtle tabular-nums">{instructions.length}/1000</p>
            </Step>

            <Step n={4} title="Run">
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-xs text-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                  CECH never submits payments, logs in, or deletes data. Forms are only submitted with clearly fake test data.
                </p>
                <Button type="submit" size="lg" disabled={submitting} className="shrink-0">
                  {submitting ? <Loader2 className="animate-spin" /> : null}
                  {submitting ? "Starting…" : "START INSPECTION"}
                  {!submitting && <ArrowRight />}
                </Button>
              </div>
              {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
            </Step>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
