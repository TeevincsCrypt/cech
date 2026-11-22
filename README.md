# CECH

**Don't just launch. Prove it works.**

CECH is an AI-powered website launch inspection and verification platform. You submit a URL and pick what to inspect. **Groq** plans the test objectives, **Kane CLI** (by TestMu AI) runs them in a real browser, and Groq explains what Kane actually observed. After you apply fixes, CECH retests the failed objectives and Kane independently confirms whether the fixes worked.

```
User → CECH (Next.js) → Groq planner → Kane worker → real Chrome → Kane NDJSON results
     → Groq analyst → Supabase → report → retest loop (Groq retest planner → Kane → compare)
```

## Principles enforced in code

- **Kane decides outcomes.** `PASSED`/`FAILED` come only from Kane's `run_end` event plus its exit code (`worker/src/kane-parser.ts`). Groq output is stored in a separate table (`ai_analyses`) and can never change `test_results.execution_status`.
- **Infrastructure ≠ website failure.** Auth, browser, network and worker problems are recorded as `ERROR`. Timeouts become `TIMEOUT`, and captcha or login walls become `INCONCLUSIVE`. None of these count against the health score.
- **No simulation.** Nothing fabricates browser activity, screenshots or verdicts. If Groq is unavailable, CECH uses clearly labelled baseline objectives, and Kane still executes them for real.

## Proof of Fix

CECH doesn't just report that something is broken. It **proves the failure and proves the fix**:

**DETECT → CAPTURE → EXPLAIN → FIX → RETEST → VERIFY**

- **Capture:** the worker observes the same Chrome session Kane drives (via `--cdp-endpoint`). It records real screenshots (before, at failure, after, full page), the URL before and after, console errors and failed requests, and stores them privately.
- **Explain:** Groq writes an evidence-grounded bug report. Every fact must cite captured evidence, and unsupported claims are removed. Facts, unconfirmed hypotheses and suggested corrections are shown separately.
- **Verify:** a fix is **VERIFIED** only when the same test genuinely failed and then genuinely passed on an equivalent retest (same expected outcome and start URL; optionally an exact replay). Timeouts, blocked runs and infrastructure errors never count. A verified test that fails again becomes **Regressed**.
- **Report:** before-and-after comparison in the Inspection Report, plus a downloadable **CECH — PROOF OF FIX REPORT** (PDF, Markdown, JSON) tied to the database record.

See `e2e/README.md` for the end-to-end harness and `docs/DEPLOYMENT.md` for rollout.

## Repository layout

| Path | What |
|---|---|
| `src/app` | Next.js App Router: landing page, `(app)` dashboard, report, history and settings pages, `demo/` website, `api/` routes |
| `src/lib/groq` | Groq service: `generateTestPlan`, `analyzeTestResult`, `generateRetestPlan`, `generateInspectionSummary` (Zod-validated structured output) |
| `src/lib/server/inspection-service.ts` | Orchestration: plan → dispatch → ingest → analyse → finalise → retest |
| `src/lib/store` | Repository with a Supabase implementation (production) and a local JSON file implementation (development) |
| `src/lib/security/url-safety.ts` | SSRF protection (shared byte-for-byte with the worker) |
| `src/lib/scoring.ts` | Transparent weighted health score |
| `worker/` | Separate Node.js Kane CLI execution service |
| `supabase/migrations` | SQL schema, indexes, foreign keys and RLS |
| `src/lib/proof-of-fix.ts` | Verification engine (pure): Open / Resolved / Recurring / Regressed / Verified |
| `worker/src/evidence.ts` | Real-browser evidence capture over CDP |
| `tests/`, `worker/test/` | Vitest tests (parser fixtures are real captured Kane output; evidence tests drive a real Chrome) |
| `e2e/` | Proof of Fix end-to-end harness (see its README for what is real vs. test double) |

## Quick start (local)

Prerequisites: Node 20+, Google Chrome at `/usr/bin/google-chrome` (or set `KANE_CLI_CHROME_PATH`), and a TestMu AI (LambdaTest) account for Kane.

```bash
npm install
npm --prefix worker install
npm install -g @testmuai/kane-cli          # tested with 0.10.7

cp .env.example .env.local                 # set GROQ_API_KEY and KANE_WORKER_SECRET
cp worker/.env.example worker/.env         # same KANE_WORKER_SECRET, plus LT_USERNAME / LT_ACCESS_KEY

npm run worker:dev                         # terminal 1: Kane worker on :8787
npm run dev                                # terminal 2: CECH on :3000
```

Open http://localhost:3000. Without Supabase variables, data persists to `.data/cech-db.json`. To inspect the built-in demo site locally, keep `SSRF_ALLOWLIST=localhost:3000` in **both** env files (development only).

Set `KANE_HEADLESS=false` in `worker/.env` to watch Kane drive Chrome during a demo.

## Demo script (built-in demo website)

1. Open **/dashboard**.
2. Go to **New Inspection** → **Use demo website**. Make sure the switch says **Broken**.
3. Select all categories → **START INSPECTION**. Groq generates the objectives.
4. Kane opens the demo site in Chrome. In broken mode the "Pricing" nav link goes to /about, the "Start your free trial" CTA throws, and the contact form never confirms.
5. Results stream into the report. Groq explains each real failure and recommends a fix.
6. Open a failed test. Its **Failure Evidence** shows real screenshots (before / at failure / after), the URL change, console errors and failed requests, plus the AI bug reproduction report.
7. Flip the switch to **Healthy**, which plays the role of the developer deploying the fix.
8. **Retest failed tests** (tick *Replay the exact original objectives* for the strongest proof). Kane re-executes the same tests.
9. The **Evidence** section shows **PROOF OF FIX — VERIFIED** with before/after screenshots, and the inspection becomes **VERIFIED**. Download the PDF report.

The demo site is served by the same app and reads its mode from the database on every request. CECH inspects it through the same worker as any external site, with no special-casing.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm test` | Unit tests (parser, SSRF, scoring) |
| `npm run typecheck` / `lint` | Static checks |
| `npm run worker:dev` / `worker:build` | Kane worker |

See **docs/DEPLOYMENT.md** for Vercel, Supabase and worker deployment, and **BUILD_STATUS.md** for current status and verification evidence.
