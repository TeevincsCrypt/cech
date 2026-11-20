/**
 * SSRF-safe target URL validation.
 *
 * SHARED FILE: an identical copy lives at worker/src/url-safety.ts so the Kane
 * worker re-validates every URL independently. A unit test asserts the two
 * copies are byte-identical — edit both or neither.
 *
 * Dependency-free on purpose (node:dns, node:net only).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface UrlSafetyOptions {
  /**
   * Exact "host:port" pairs that bypass the private-address checks.
   * Development only (e.g. "localhost:3000" so the built-in demo site can be
   * inspected locally). Empty in production.
   */
  allowlist?: string[];
  /** Skip DNS resolution (used by synchronous form validation). */
  skipDns?: boolean;
}

export type UrlSafetyResult =
  | { ok: true; url: URL; normalized: string; addresses: string[] }
  | { ok: false; reason: string };

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".localdomain",
  ".home.arpa",
];

const BLOCKED_HOSTNAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inV4Cidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_V4.some(([base, bits]) => inV4Cidr(ip, base, bits));
}

function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1)
  let tail: number[] = [];
  const v4Match = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    const n = ipv4ToInt(v4Match[1]);
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    addr = addr.slice(0, -v4Match[1].length) + "0:0";
  }
  const parts = addr.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const rest = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (parts.length === 1 && fill !== 0)) return null;
  const groups = [...head, ...Array(parts.length === 2 ? fill : 0).fill("0"), ...rest].map((g) =>
    parseInt(g || "0", 16),
  );
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  if (tail.length) {
    groups[6] = tail[0];
    groups[7] = tail[1];
  }
  return groups;
}

export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true; // unparsable => treat as unsafe
  const allZero = g.every((x) => x === 0);
  if (allZero) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPrivateIPv4(v4);
  }
  // NAT64 64:ff9b::/96
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPrivateIPv4(v4);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2002) return true; // 6to4 (can embed private v4)
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

function hostKey(url: URL): string {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname.toLowerCase()}:${port}`;
}

export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Synchronous structural validation (no DNS). */
export function validateUrlSyntax(
  input: string,
  options: UrlSafetyOptions = {},
): { ok: true; url: URL; allowlisted: boolean } | { ok: false; reason: string } {
  if (typeof input !== "string") return { ok: false, reason: "URL must be a string." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Enter a website URL." };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "URL is too long." };
  // Reject control characters / whitespace inside the URL.
  if (/[\u0000-\u001f\u007f\s\\]/.test(trimmed)) {
    return { ok: false, reason: "URL contains invalid characters." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "That is not a valid URL. Include http:// or https://." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http:// and https:// URLs can be inspected." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed." };
  }

  const allowlisted = (options.allowlist ?? []).includes(hostKey(url));
  if (allowlisted) return { ok: true, url, allowlisted };

  // WHATWG URL already canonicalises numeric hosts (e.g. 2130706433 -> 127.0.0.1).
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) return { ok: false, reason: "URL has no hostname." };

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      return { ok: false, reason: "Private, loopback and internal IP addresses cannot be inspected." };
    }
    return { ok: true, url, allowlisted };
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((s) => hostname === s.replace(/^\./, "") || hostname.endsWith(s))) {
    return { ok: false, reason: "Local and internal hostnames cannot be inspected." };
  }
  if (!hostname.includes(".")) {
    return { ok: false, reason: "Use a fully-qualified public domain name." };
  }
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith("-") || hostname.includes("..")) {
    return { ok: false, reason: "Hostname contains invalid characters." };
  }
  return { ok: true, url, allowlisted };
}

/**
 * Full validation: syntax + DNS resolution. Every resolved address must be
 * public. (Residual DNS-rebinding risk between this check and the browser's own
 * lookup is mitigated by re-checking in the worker immediately before launch.)
 */
export async function assertPublicUrl(
  input: string,
  options: UrlSafetyOptions = {},
): Promise<UrlSafetyResult> {
  const syntax = validateUrlSyntax(input, options);
  if (!syntax.ok) return syntax;
  const { url, allowlisted } = syntax;
  url.hash = "";
  const normalized = url.toString();

  if (allowlisted || options.skipDns) {
    return { ok: true, url, normalized, addresses: [] };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return { ok: true, url, normalized, addresses: [hostname] };

  let addresses: string[];
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { ok: false, reason: `Could not resolve ${hostname}. Check the domain is publicly reachable.` };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: `Could not resolve ${hostname}.` };
  }
  const bad = addresses.find((a) => isPrivateAddress(a));
  if (bad) {
    return { ok: false, reason: `${hostname} resolves to a private or internal address and cannot be inspected.` };
  }
  return { ok: true, url, normalized, addresses };
}
