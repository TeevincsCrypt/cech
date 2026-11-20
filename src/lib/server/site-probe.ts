import "server-only";
import { assertPublicUrl } from "@/lib/security/url-safety";
import { config } from "@/lib/server/config";

/**
 * Lightweight structural probe of the target homepage, used ONLY to ground the
 * Groq planner in what actually exists on the page (so it doesn't invent
 * functionality). It does not execute tests and produces no verdicts.
 *
 * Every hop (including redirects) is re-validated for SSRF safety.
 * All extracted content is untrusted and is passed to the model as data.
 */
export interface SiteProbe {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  title: string | null;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  forms: Array<{ action: string; fields: string[]; submit: string }>;
  error: string | null;
}

const MAX_BYTES = 600_000;
const TIMEOUT_MS = 8000;

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function extractStructure(html: string, baseUrl: string): Omit<SiteProbe, "ok" | "finalUrl" | "status" | "error"> {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headings = [...body.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => `h${m[1]}: ${clip(decode(m[2]), 120)}`)
    .filter((h) => h.length > 4)
    .slice(0, 20);

  const seen = new Set<string>();
  const links: SiteProbe["links"] = [];
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    const text = clip(decode(m[2]) || attr(m[1], "aria-label") || "", 80);
    if (!href || href.startsWith("javascript:") || !text) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const key = `${text}|${abs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ text, href: abs });
    if (links.length >= 40) break;
  }

  const buttons = [...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((m) => clip(decode(m[1]), 60))
    .filter(Boolean)
    .slice(0, 20);

  const forms = [...body.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].slice(0, 6).map((m) => {
    const inner = m[2];
    const fields = [...inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)]
      .map((f) => {
        const type = attr(f[2], "type") ?? f[1].toLowerCase();
        if (["hidden", "submit", "button"].includes(type)) return null;
        const name = attr(f[2], "name") ?? attr(f[2], "id") ?? attr(f[2], "placeholder") ?? "field";
        const req = /\brequired\b/i.test(f[2]) ? " (required)" : "";
        return `${clip(name, 40)}:${type}${req}`;
      })
      .filter((x): x is string => Boolean(x))
      .slice(0, 12);
    const submit =
      decode(inner.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i)?.[1] ?? "") ||
      attr(inner.match(/<input\b[^>]*type=["']?submit[^>]*>/i)?.[0] ?? "", "value") ||
      "";
    return { action: attr(m[1], "action") ?? "", fields, submit: clip(submit, 40) };
  });

  return { title: title ? clip(decode(title[1]), 150) : null, headings, links, buttons, forms };
}

export async function probeSite(url: string): Promise<SiteProbe> {
  const empty: SiteProbe = {
    ok: false,
    finalUrl: null,
    status: null,
    title: null,
    headings: [],
    links: [],
    buttons: [],
    forms: [],
    error: null,
  };
  let current = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const safe = await assertPublicUrl(current, { allowlist: config.ssrfAllowlist });
      if (!safe.ok) return { ...empty, error: `Blocked redirect target: ${safe.reason}` };
      const res = await fetch(safe.normalized, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "CECH-SiteProbe/1.0 (+launch verification)", accept: "text/html" },
        cache: "no-store",
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, safe.normalized).toString();
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) {
        return { ...empty, finalUrl: safe.normalized, status: res.status, error: `Non-HTML response (${type || "unknown"})` };
      }
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        const dec = new TextDecoder();
        let total = 0;
        while (total < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          html += dec.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
      }
      return {
        ok: res.ok,
        finalUrl: safe.normalized,
        status: res.status,
        error: res.ok ? null : `HTTP ${res.status}`,
        ...extractStructure(html, safe.normalized),
      };
    }
    return { ...empty, error: "Too many redirects" };
  } catch (err) {
    return { ...empty, error: `Probe failed: ${(err as Error).message}` };
  }
}

export function describeProbe(p: SiteProbe): string {
  if (!p.ok && !p.title && p.links.length === 0) {
    return `Homepage structure could not be retrieved (${p.error ?? "unknown error"}). Plan cautious exploratory tests and state assumptions.`;
  }
  const lines = [
    `Final URL: ${p.finalUrl}`,
    `HTTP status: ${p.status}`,
    `Title: ${p.title ?? "(none)"}`,
    `Headings:\n${p.headings.map((h) => `  - ${h}`).join("\n") || "  (none found)"}`,
    `Links (text -> href):\n${p.links.map((l) => `  - ${l.text} -> ${l.href}`).join("\n") || "  (none found)"}`,
    `Buttons:\n${p.buttons.map((b) => `  - ${b}`).join("\n") || "  (none found)"}`,
    `Forms:\n${
      p.forms.map((f, i) => `  - form ${i + 1} action="${f.action}" fields=[${f.fields.join(", ")}] submit="${f.submit}"`).join("\n") ||
      "  (none found in server HTML; the page may render forms client-side)"
    }`,
  ];
  return lines.join("\n");
}
