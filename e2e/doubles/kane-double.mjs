#!/usr/bin/env node
/**
 * TEST DOUBLE for kane-cli — used ONLY by the local Proof of Fix E2E harness,
 * because real Kane needs TestMu AI credentials + cloud access.
 *
 * It honours the same CLI contract the CECH worker uses
 * (`run <objective> --url <u> --agent --cdp-endpoint <e> ...`), connects to the
 * worker's evidence browser over CDP exactly like Kane, really performs the
 * Quillstack interaction described by the objective, and reports passed/failed
 * ONLY from what the browser actually shows. NDJSON output mirrors Kane's
 * agent mode (step events + run_end). Never use this in production.
 */
import { chromium } from "/home/user/cech/worker/node_modules/playwright-core/index.mjs";

const argv = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
if (argv[0] === "--version") { console.log("0.0.0-test-double"); process.exit(0); }
if (argv[0] === "whoami") { console.log("Logged in (test double)"); process.exit(0); }
if (argv[0] !== "run") { console.error("unsupported"); process.exit(2); }

const objective = argv[1];
const flag = (n) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : null; };
const url = flag("--url");
const cdp = flag("--cdp-endpoint");
const started = Date.now();
out({ type: "stream_start", cli_version: "0.0.0-test-double", surface: "run", v: 1 });
let step = 0;
const s = (status, remark) => out({ step: step, status, remark });
const end = (passed, summary, reason) => {
  out({ type: "run_end", status: passed ? "passed" : "failed", summary, one_liner: summary, reason, duration: (Date.now() - started) / 1000 });
  process.exit(passed ? 0 : 1);
};
if (!cdp) { console.error("test double requires --cdp-endpoint"); process.exit(2); }

const browser = await chromium.connectOverCDP(cdp);
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.isClosed()) ?? (await ctx.newPage());
const path = () => new URL(page.url()).pathname;
const o = objective.toLowerCase();
try {
  step++; s("running", `Navigate to ${url}`);
  await page.goto(url, { waitUntil: "load" });
  s("done", `Opened ${path()}`);
  if (o.includes("pricing")) {
    step++; s("running", "Click 'Pricing' in the main navigation");
    await page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "Pricing" }).click();
    await page.waitForLoadState("load"); await page.waitForTimeout(800);
    const ok = path().endsWith("/demo/pricing");
    s(ok ? "done" : "failed", ok ? `Reached ${path()}` : `URL is ${path()}, expected /demo/pricing`);
    end(ok, ok ? "Clicked Pricing and reached the pricing page." : `Clicked Pricing but the browser landed on ${path()} instead of /demo/pricing.`, ok ? "Objective completed" : "Assertion failed: wrong destination");
  } else if (o.includes("free trial")) {
    step++; s("running", "Click 'Start your free trial'");
    await page.getByText("Start your free trial").first().click();
    await page.waitForTimeout(1500);
    const ok = path().endsWith("/demo/signup");
    s(ok ? "done" : "failed", ok ? `Reached ${path()}` : `Still on ${path()} after clicking the CTA`);
    end(ok, ok ? "The trial CTA opened the signup page." : "Clicked the trial CTA but the page did not navigate.", ok ? "Objective completed" : "Assertion failed: no navigation");
  } else if (o.includes("contact")) {
    step++; s("running", "Open the contact page and fill the form with test data");
    await page.goto(new URL("/demo/contact", url).toString(), { waitUntil: "load" });
    await page.fill("#name", "CECH Test");
    await page.fill("#email", "cech-test@example.com");
    await page.fill("#message", "Automated launch verification test - please ignore.");
    s("done", "Filled name, email and message");
    step++; s("running", "Submit the form");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForTimeout(2500);
    const ok = (await page.getByText("Your message has been sent").count()) > 0;
    s(ok ? "done" : "failed", ok ? "Confirmation message is visible" : "No confirmation message appeared after submitting");
    end(ok, ok ? "Submitted the contact form and saw the confirmation." : "Submitted the contact form but no confirmation appeared.", ok ? "Objective completed" : "Assertion failed: confirmation missing");
  } else {
    end(false, "Test double does not understand this objective.", "unsupported objective");
  }
} catch (err) {
  out({ type: "error", message: String(err?.message ?? err) });
  process.exit(2);
}
