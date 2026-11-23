# CECH — Build Status

_Last updated: 2026-11-23_

## Summary

CECH is **deployed and working end to end in production**:

- **App:** Vercel.
- **Database and evidence storage:** Supabase (PostgreSQL plus a private Storage bucket).
- **Kane worker:** Railway, running the real Kane CLI.
- **AI:** Groq.

The full loop runs live on the built-in Quillstack demo:

> Groq plans tests → Kane runs them in a real browser → evidence and AI analysis → fix → retest → **PROOF OF FIX — VERIFIED**

The project owner confirmed on the live deployment that inspections work and that Proof of Fix works after the migration and worker redeploy.

Status sources used below:
- **Confirmed in production:** reported by the project owner on the live deployment.
- **Verified by tests:** automated tests and local end-to-end runs in the build environment.
- **Not yet confirmed:** implemented, but no production confirmation yet.

---

## 🟢 Confirmed in production

| Area | Status |
|---|---|
| Deployment | Vercel (app), Supabase (DB + Storage), Railway (Kane worker) |
| Configuration | All environment variables set: Groq, Supabase, worker URL/secret, TestMu AI credentials |
| Inspections | Groq-planned tests executed by **real Kane CLI** in a real browser; results, analysis and reports in CECH |
| Proof of Fix | Migration `20261122000000_proof_of_fix.sql` applied, app and worker redeployed; evidence capture and the verified-fix flow work live |
| New Inspection form | The "stuck on Starting…" bug is fixed and confirmed |

## 🔬 Verified by tests (build environment)

| Check | Result |
|---|---|
| `npm test` | **113 passing**: 65 original + 48 added for Proof of Fix and post-launch fixes |
| Kane parser | Tested against **real captured kane-cli 0.10.7 output** (e.g. unauthenticated runs exit 1 with no `run_end`; never treated as a website failure) |
| Evidence capture | Two **real-Chrome** integration tests: screenshots, URL before→after, real console errors, real failed requests, and capture failures that never affect the result |
| Verification engine | 17 rule tests: Verified only after a genuine fail → equivalent genuine pass; timeouts, blocked runs and errors never count; a different test's result is ignored; a changed expected outcome or start URL is not verified; a verified fix that later fails becomes Regressed |
| Evidence storage and security | Magic-byte and size validation, SHA-256 match, path-traversal rejection, orphan cleanup, no cross-inspection access (404), safe degradation without the migration |
| Groq | Structured-output recovery (invalid JSON, missing fields, rate limits, outages); bug reports drop claims citing non-existent evidence; severity is capped by test priority |
| SSRF | 37 URL cases; live checks rejected loopback, cloud metadata, private ranges, `file://` and encoded IPs at both the API and the worker |
| End-to-end (local) | Quillstack Broken → 3 real failures with evidence → Healthy → exact retest → 3 verified fixes → PDF/MD/JSON reports. Kane and Groq were test doubles here (see `e2e/README.md`); the browser, evidence, storage and verification were real |
| SQL migrations | Both applied to real Postgres (PGlite), including idempotent re-run, constraints, RLS, private bucket and cascades |
| Static checks | `tsc`, ESLint, `next build` and the worker build are clean |
| UI | Every page reviewed on desktop and iPhone-size viewports; no console errors; no horizontal overflow |

## 🟡 Not yet confirmed in production

- **Proof of Fix PDF download from Supabase Storage.** It works locally (valid PDF with real screenshots); download it once on the live site to confirm.
- **Proportionate severity fix** (heading/wording checks are low priority; AI severity is capped by priority). Pushed to `main`, but not yet seen in a fresh live inspection.
- **railway.com result.** It returned no health score. The report now shows the cause (timeouts vs blocked automation), and the fix depends on which one it is.

---

## ✅ Features

| Area | Notes |
|---|---|
| Landing page | Hero, how it works, capabilities, Kane verification, example report (labelled illustrative), why CECH, final CTA |
| Dashboard | Real-data stats, health heat bar, recent inspections, quality map, recent activity; loading, empty and error states |
| New Inspection | URL validation (SSRF-safe), four categories, instructions, demo-site panel with the Broken/Healthy switch |
| Groq service | Test plan, result analysis, retest plan, inspection summary, **bug reproduction report**. Strict JSON schema with fallback, Zod validation, repair retry, rate-limit handling, token logging |
| Kane worker | Separate Node service: bearer auth, SSRF re-check before every launch, argv-only spawning, timeouts, concurrency limit, live steps, callbacks plus polling, `/health` |
| **Proof of Fix** | Real-browser evidence over CDP (before / at failure / after / full page, URLs, console errors, failed requests); private storage; evidence-grounded bug reports; exact-replay retests; before/after **PROOF OF FIX — VERIFIED**; regression tracking; PDF/Markdown/JSON reports with a verification reference |
| Results | Kane outcome and AI interpretation kept as separate layers; the AI never changes a verdict |
| Health score | Weighted by priority (3/2/1) over conclusive verdicts only; withheld with a breakdown of the cause when data is insufficient |
| Issue states | Open, Resolved, Recurring, Regressed, Verified |
| History | All inspections, per-website score trends, resolved and recurring counts |
| Demo site | Quillstack (`/demo`): Broken mode has a dead CTA, a contact form without confirmation, and Pricing nav → About |
| Settings | Live status for Groq, Supabase, Proof of Fix evidence, worker, and Kane version/authentication |
| Brand | Official logo (vector, light and on-dark), favicon, app icons, X profile kit |
| Design | Light UI after the provided reference: lavender frame, icon rail, black pills, heat bar, quality map |

## 🛠 Post-launch fixes

- Vercel's read-only filesystem: temporary `/tmp` storage when Supabase isn't configured.
- New Inspection button stuck on "Starting…" after a first run (Next.js keeps visited pages alive).
- The report now explains *why* there's no health score, with a next step for the most common cause.
- The demo CTA's loading placeholder was an inert look-alike button; the Proof of Fix E2E caught it.
- The worker no longer leaks internal filesystem paths in evidence references.
- Cosmetic checks (e.g. a missing `<h1>`) can no longer be rated as major issues.
- The two logo SVGs no longer clash when both are embedded on one page.

## 🐞 Known limitations

- **Coverage:** no security, performance, load, full accessibility or visual-regression testing. Desktop Chrome only (1920×1080). Never logs in, pays or deletes data.
- **Bot protection:** sites behind it come back as "Site blocked automation", not as defects.
- **Rate limiting:** per server instance and in memory.
- **Worker job state:** in memory. A worker restart mid-run is detected and recorded as an infrastructure error.
- **Demo mode:** one switch shared by everyone viewing the demo.
- **No user accounts:** access is by unguessable inspection and artifact IDs, plus an artifact ↔ inspection check.
- **Kane's own sealed evidence pack** isn't imported. Its presence and the TestMu test-run link are recorded.
- **Homepage probe** reads server-rendered HTML only.
- **DNS rebinding:** a residual window between the worker's URL check and Chrome's own lookup. Egress firewalling on the worker closes it.

## 🔑 Environment (all configured in production)

| Variable | Where |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Vercel |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel |
| `KANE_WORKER_URL`, `KANE_WORKER_SECRET`, `CECH_APP_URL` | Vercel and worker |
| `LT_USERNAME`, `LT_ACCESS_KEY` | Worker |
| Optional: `CECH_EVIDENCE_BUCKET`, `CECH_ARTIFACT_DIR`, `KANE_EVIDENCE`, `KANE_ARTIFACT_DIR`, `KANE_TEST_TIMEOUT_SEC` | See `docs/DEPLOYMENT.md` |

## Next steps

1. Run one fresh demo on the live site: Broken → inspect → Healthy → retest with exact replay → download the Proof of Fix PDF. This confirms the remaining 🟡 items, and is a good take for the submission video.
2. Optional (P2): user accounts with per-user access, a per-session demo mode, and a shared rate-limit store.
