"use client";
import { ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/client/use-api";
import type { DemoSettings } from "@/lib/types";

export function DemoModePanel({ onUseDemo, compact }: { onUseDemo?: (url: string) => void; compact?: boolean }) {
  const { data, reload } = useApi<DemoSettings>("/api/demo/mode");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mode = data?.mode;

  async function setMode(next: "healthy" | "broken") {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/demo/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: next }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not change mode");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl bg-surface-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <FlaskConical className="size-4 text-ink" />
          </span>
          <div>
            <p className="text-sm font-medium">Built-in demo website</p>
            {!compact && (
              <p className="mt-0.5 text-xs text-muted">
                A real site served by CECH. Broken mode introduces a dead CTA, a contact form without confirmation and a mis-linked nav item.
              </p>
            )}
          </div>
        </div>
        {mode && <Badge tone={mode === "healthy" ? "green" : "red"}>{mode === "healthy" ? "Healthy" : "Broken"}</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          <span className={mode === "broken" ? "font-medium text-danger" : "text-subtle"}>Broken</span>
          <Switch
            checked={mode === "healthy"}
            disabled={!mode || saving}
            onCheckedChange={(v) => setMode(v ? "healthy" : "broken")}
            className="data-[state=unchecked]:border-danger data-[state=unchecked]:bg-danger"
            aria-label="Toggle demo website mode"
          />
          <span className={mode === "healthy" ? "font-medium text-accent" : "text-subtle"}>Healthy</span>
          {saving && <Loader2 className="size-3.5 animate-spin text-muted" />}
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href="/demo" target="_blank" rel="noreferrer">
              Open <ExternalLink />
            </a>
          </Button>
          {onUseDemo && (
            <Button variant="primary" size="sm" type="button" onClick={() => onUseDemo(`${window.location.origin}/demo`)}>
              Use demo website
            </Button>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
