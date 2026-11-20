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
| `tests/`, `worker/test/` | Vitest unit tests (parser fixtures are real captured Kane output) |

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
6. Flip the switch to **Healthy**, which plays the role of the developer deploying the fix.
7. **Retest failed tests.** Groq writes focused objectives from Kane's previous output, and Kane re-executes them.
8. The **Verification history** shows FAILED → PASSED ("Resolved"), and the inspection becomes **VERIFIED**.

The demo site is served by the same app and reads its mode from the database on every request. CECH inspects it through the same worker as any external site, with no special-casing.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm test` | Unit tests (parser, SSRF, scoring) |
| `npm run typecheck` / `lint` | Static checks |
| `npm run worker:dev` / `worker:build` | Kane worker |

See **docs/DEPLOYMENT.md** for Vercel, Supabase and worker deployment, and **BUILD_STATUS.md** for current status and verification evidence.
