import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress, validateUrlSyntax } from "@/lib/security/url-safety";

describe("validateUrlSyntax", () => {
  const rejected = [
    "ftp://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://2130706433", // decimal 127.0.0.1
    "http://0x7f.0.0.1",
    "http://10.0.0.5/admin",
    "http://192.168.1.1",
    "http://172.20.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "http://intranet/",
    "https://user:pass@example.com",
    "https://exa mple.com",
    "not a url",
  ];
  for (const u of rejected) {
    it(`rejects ${u}`, () => expect(validateUrlSyntax(u).ok).toBe(false));
  }

  for (const u of ["https://example.com", "http://example.com/pricing?x=1", "https://sub.domain.co.uk:8443/a", "http://8.8.8.8/"]) {
    it(`accepts ${u}`, () => expect(validateUrlSyntax(u).ok).toBe(true));
  }

  it("allowlist permits exact host:port only", () => {
    expect(validateUrlSyntax("http://localhost:3000/demo", { allowlist: ["localhost:3000"] }).ok).toBe(true);
    expect(validateUrlSyntax("http://localhost:3001/demo", { allowlist: ["localhost:3000"] }).ok).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "::1", "fe80::1", "64:ff9b::7f00:1", "0.0.0.0"])("%s is private", (ip) =>
    expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "2606:4700::1111", "1.1.1.1"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertPublicUrl", () => {
  it("returns a normalized URL without fragment for allowlisted hosts", async () => {
    const r = await assertPublicUrl("http://localhost:3000/demo#top", { allowlist: ["localhost:3000"] });
    expect(r.ok && r.normalized).toBe("http://localhost:3000/demo");
  });
});

describe("shared file", () => {
  it("worker copy of url-safety.ts is byte-identical to the app copy", () => {
    const root = path.resolve(__dirname, "..");
    expect(readFileSync(path.join(root, "worker/src/url-safety.ts"), "utf8")).toBe(
      readFileSync(path.join(root, "src/lib/security/url-safety.ts"), "utf8"),
    );
  });
});
