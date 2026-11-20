"use client";
import { Bot, CheckCircle2, Database, Globe2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { DemoModePanel } from "@/components/app/demo-mode-panel";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/client/use-api";

interface Health {
  integrations: { groq: boolean; groqModel: string; supabase: boolean; worker: boolean; storage: string; ssrfAllowlist: string[] };
  worker: null | {
    ok?: boolean;
    error?: string;
    kane?: { version: string | null; authenticated: boolean | null; detail?: string };
    headless?: boolean;
    callbacks?: boolean;
    concurrency?: number;
    activeTests?: number;
    queuedTests?: number;
  };
}

function Row({ label, ok, children }: { label: string; ok: boolean | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {children && <div className="mt-0.5 text-xs text-muted">{children}</div>}
      </div>
      {ok == null ? <Badge tone="grey">Unknown</Badge> : ok ? <Badge tone="green"><CheckCircle2 className="size-3.5" />Ready</Badge> : <Badge tone="red"><XCircle className="size-3.5" />Not configured</Badge>}
    </div>
  );
}

const ENV = [
  ["GROQ_API_KEY", "Groq API key (server only)"],
  ["GROQ_MODEL", "Groq model id, default openai/gpt-oss-120b"],
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key (not used for data access; RLS denies it)"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key (server only)"],
  ["KANE_WORKER_URL", "Base URL of the Kane worker"],
  ["KANE_WORKER_SECRET", "Shared secret between app and worker"],
  ["CECH_APP_URL", "Public URL of this app (set on the worker for callbacks)"],
];

export function SettingsView() {
  const { data, error, loading, reload } = useApi<Health>("/api/health");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        description="Integration status for this CECH deployment. Secret values are never shown."
        actions={
          <Button variant="secondary" onClick={reload}>
            <RefreshCcw /> Re-check
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingState label="Checking integrations…" />
      ) : error && !data ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bot className="size-4 text-muted" /> AI · Groq</CardTitle>
              <CardDescription>Plans tests, analyses Kane results, writes retest objectives.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Groq API" ok={data.integrations.groq}>
                Model: <code className="font-mono">{data.integrations.groqModel}</code>
                {!data.integrations.groq && <span className="block text-warning">Without Groq, CECH falls back to labelled baseline objectives and shows Kane results without AI analysis.</span>}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="size-4 text-muted" /> Storage</CardTitle>
              <CardDescription>Inspections, tests, Kane results and analyses.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Supabase PostgreSQL" ok={data.integrations.supabase}>
                Active store: <code className="font-mono">{data.integrations.storage}</code>
                {!data.integrations.supabase && <span className="block">Using a local JSON file (development only).</span>}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="size-4 text-muted" /> Kane worker</CardTitle>
              <CardDescription>Runs Kane CLI in a real browser for every test.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row label="Worker configured" ok={data.integrations.worker} />
              <Row label="Worker reachable" ok={data.worker ? Boolean(data.worker.ok) : data.integrations.worker ? false : null}>
                {data.worker?.error}
                {data.worker?.ok && `Concurrency ${data.worker.concurrency} · ${data.worker.activeTests} running · ${data.worker.queuedTests} queued · ${data.worker.headless ? "headless" : "visible browser"} · callbacks ${data.worker.callbacks ? "on" : "off (polling)"}`}
              </Row>
              <Row label="Kane CLI installed" ok={data.worker?.ok ? Boolean(data.worker.kane?.version) : null}>
                {data.worker?.kane?.version ? `kane-cli ${data.worker.kane.version}` : data.worker?.kane?.detail}
              </Row>
              <Row label="Kane authenticated (TestMu AI)" ok={data.worker?.ok ? Boolean(data.worker.kane?.authenticated) : null}>
                {data.worker?.ok && !data.worker.kane?.authenticated && "Set LT_USERNAME and LT_ACCESS_KEY on the worker, or run kane-cli login there."}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted" /> Security</CardTitle>
              <CardDescription>URL validation runs in both the app and the worker.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <p>Private, loopback, link-local, metadata and internal hosts are rejected after DNS resolution. Redirects are re-validated.</p>
              <p>
                Dev allowlist:{" "}
                {data.integrations.ssrfAllowlist.length ? (
                  data.integrations.ssrfAllowlist.map((h) => <code key={h} className="mr-1 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-warning">{h}</code>)
                ) : (
                  <span className="text-accent">empty (production-safe)</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Demo website</CardTitle>
            </CardHeader>
            <CardContent>
              <DemoModePanel />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Environment variables</CardTitle>
              <CardDescription>Configure these in Vercel (app) and on the worker host. See .env.example and README.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/60 text-sm">
                {ENV.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-6">
                    <dt className="w-72 shrink-0 font-mono text-xs text-foreground">{k}</dt>
                    <dd className="text-xs text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
