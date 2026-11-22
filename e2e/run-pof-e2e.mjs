#!/usr/bin/env node
/**
 * Proof of Fix end-to-end driver — the Quillstack demo flow over CECH's HTTP API:
 *   Broken mode → inspection → evidence → Healthy mode → exact retest → Proof of Fix.
 *
 * Usage:  APP=http://localhost:3100 OUT=/tmp/pof node e2e/run-pof-e2e.mjs [--real-kane]
 * --real-kane: only checks that a real (possibly unauthenticated) kane-cli run
 *              still records honest outcomes and captures evidence.
 * See e2e/README.md for which components are real and which are test doubles.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const APP = process.env.APP ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "/tmp/cech-pof-e2e";
const realKane = process.argv.includes("--real-kane");
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("•", ...a);
const fail = (m) => {
  console.error("✗ FAILED:", m);
  process.exit(1);
};
const check = (cond, m) => (cond ? log("✓", m) : fail(m));
const api = async (p, init) => {
  const res = await fetch(`${APP}${p}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return { status: res.status, res };
};
const json = async (p, init) => {
  const { res, status } = await api(p, init);
  const body = await res.json().catch(() => ({}));
  if (status >= 400) fail(`${init?.method ?? "GET"} ${p} → ${status} ${JSON.stringify(body)}`);
  return body;
};
async function waitDone(id, label) {
  const t0 = Date.now();
  for (;;) {
    const r = await json(`/api/inspections/${id}`);
    if (r.inspection.status === "completed" || r.inspection.status === "failed") return r;
    if (Date.now() - t0 > 6 * 60_000) fail(`${label} did not complete in time`);
    await new Promise((res) => setTimeout(res, 2000));
  }
}
const setMode = (mode) => json("/api/demo/mode", { method: "POST", body: JSON.stringify({ mode }) });
const byTitle = (r, re) => r.tests.find((t) => re.test(t.title));

// ---------------------------------------------------------------- real Kane smoke
if (realKane) {
  await setMode("broken");
  const { id } = await json("/api/inspections", { method: "POST", body: JSON.stringify({ url: `${APP}/demo`, categories: ["interface"] }) });
  const r = await waitDone(id, "real-kane inspection");
  const res = r.tests[0].results.at(-1);
  log(`real kane-cli outcome: ${res.execution_status} (${res.error_kind}) — ${res.kane_reason}`);
  check(res.execution_status !== "PASSED" || res.exit_code === 0, "Kane outcome is honest (no pass without a Kane verdict)");
  check(res.evidence?.mode === "cdp", "evidence session ran alongside real kane-cli");
  check(res.artifacts.some((a) => a.kind === "before"), "'before' screenshot captured from the real browser and stored");
  writeFileSync(path.join(OUT, "real-kane-report.json"), JSON.stringify(r, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- 1. Broken mode inspection
await setMode("broken");
log("Quillstack set to BROKEN");
const { id } = await json("/api/inspections", {
  method: "POST",
  body: JSON.stringify({ url: `${APP}/demo`, categories: ["navigation", "forms", "journey"], instructions: "Check pricing navigation, the trial CTA and the contact form." }),
});
log("inspection", id);
let r = await waitDone(id, "initial inspection");
check(r.inspection.status === "completed", "initial inspection completed");

const pricing = byTitle(r, /pricing/i);
const cta = byTitle(r, /cta/i);
const contact = byTitle(r, /contact/i);
for (const [t, name] of [[pricing, "Pricing nav"], [cta, "Trial CTA"], [contact, "Contact form"]]) {
  const last = t.results.at(-1);
  check(last.execution_status === "FAILED", `${name}: Kane outcome FAILED in broken mode`);
  check(last.artifacts.length >= 2, `${name}: ${last.artifacts.map((a) => a.kind).join(", ")} screenshots stored`);
  check(last.analysis?.bug_report?.steps_to_reproduce?.length > 0, `${name}: evidence-grounded bug report generated`);
}
const pe = pricing.results.at(-1).evidence;
check(pe.url_before.endsWith("/demo") && pe.url_after.endsWith("/demo/about"), `Pricing nav: URL ${pe.url_before} → ${pe.url_after}`);
check(cta.results.at(-1).evidence.console_errors.some((c) => /Trial CTA failed/.test(c.text)), "Trial CTA: real console error captured");
check(contact.results.at(-1).evidence.failed_requests.some((f) => f.status === 404 && f.url.includes("/api/demo/contact-submit")), "Contact form: real 404 request captured");
check(r.verifications.length === 0 && r.inspection.overall_status === "issues_found", "no fix verified yet; status issues_found");

// Evidence access
const art = pricing.results.at(-1).artifacts.find((a) => a.kind === "at_failure") ?? pricing.results.at(-1).artifacts[0];
const img = await api(`/api/inspections/${id}/evidence/${art.id}`);
const bytes = Buffer.from(await img.res.arrayBuffer());
check(img.status === 200 && bytes[0] === 0xff && bytes[1] === 0xd8, `evidence image served (${bytes.length} bytes, ${img.res.headers.get("cache-control")})`);
writeFileSync(path.join(OUT, `original-${art.kind}.jpg`), bytes);
const cross = await api(`/api/inspections/00000000-0000-4000-8000-000000000000/evidence/${art.id}`);
check(cross.status === 404, "artifact is not reachable through a different inspection (404)");
const noProof = await api(`/api/inspections/${id}/proof/${pricing.id}?format=json`);
check(noProof.status === 409, "no Proof of Fix report before a verified fix (409)");

// ---------------------------------------------------------------- 2. Healthy mode + exact retest
await setMode("healthy");
log("Quillstack set to HEALTHY (the 'fix' is deployed)");
await json(`/api/inspections/${id}/retest`, { method: "POST", body: JSON.stringify({ scope: "failed", mode: "exact" }) });
r = await waitDone(id, "retest");
for (const name of ["pricing", "cta", "contact"]) {
  const t = byTitle(r, new RegExp(name, "i"));
  const last = t.results.at(-1);
  check(last.execution_status === "PASSED", `${t.title}: Kane outcome PASSED after the fix`);
  check(last.objective === t.results[0].objective, `${t.title}: retest re-executed the identical objective`);
}
check(r.verifications.length === 3 && r.verifications.every((v) => v.status === "verified" && v.equivalence === "exact_objective"), "3 Proof of Fix records (verified, exact replay)");
check(r.inspection.overall_status === "verified", "inspection overall status VERIFIED");
const pricing2 = byTitle(r, /pricing/i);
check(pricing2.results.at(-1).evidence.url_after.endsWith("/demo/pricing"), `Pricing nav after fix: URL → ${pricing2.results.at(-1).evidence.url_after}`);
const after = pricing2.results.at(-1).artifacts.find((a) => a.kind === "after_viewport");
writeFileSync(path.join(OUT, "retest-after_viewport.jpg"), Buffer.from(await (await api(`/api/inspections/${id}/evidence/${after.id}`)).res.arrayBuffer()));

// ---------------------------------------------------------------- 3. Proof of Fix reports
for (const fmt of ["pdf", "md", "json"]) {
  const { status, res } = await api(`/api/inspections/${id}/proof/${pricing.id}?format=${fmt}`);
  const buf = Buffer.from(await res.arrayBuffer());
  check(status === 200 && buf.length > 200, `Proof of Fix ${fmt.toUpperCase()} downloaded (${buf.length} bytes)`);
  writeFileSync(path.join(OUT, `proof-of-fix-pricing.${fmt}`), buf);
  if (fmt === "pdf") check(buf.subarray(0, 5).toString() === "%PDF-", "PDF is a valid PDF");
  if (fmt === "json") check(JSON.parse(buf.toString()).status === "PROOF OF FIX — VERIFIED", "JSON status: PROOF OF FIX — VERIFIED");
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(r, null, 2));
writeFileSync(path.join(OUT, "inspection-id.txt"), id);
log(`DONE — artifacts in ${OUT}`);
