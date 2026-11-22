# CECH — Build Status

_Last updated: 2026-11-20_

## Summary

The full MVP is implemented: app, API, orchestration, Groq service, Kane worker, Supabase schema, demo site and docs. The pipeline has been run end to end against the **real Kane CLI binary** (v0.10.7). In this build environment, three external credentials were missing and two hosts were blocked by the network policy, so real Kane browser runs could not authenticate and Groq could not be called. Every result produced here is therefore an honest `ERROR (auth)`, not a pass or fail. Completing the final acceptance demo needs the credentials listed below.

## ✅ Completed

| Area | Notes |
|---|---|
| Landing page | Hero, how it works, capabilities, Kane verification, example report (labelled illustrative), why CECH, final CTA |
| Dashboard | Stats from DB only, recent inspections, recent activity, health trend, quick CTA; loading, empty and error states |
| New inspection | URL validation, 4 categories, instructions, demo-site panel with the healthy/broken switch |
| Groq service | `generateTestPlan`, `analyzeTestResult`, `generateRetestPlan`, `generateInspectionSummary`; strict `json_schema` with `json_object` fallback; Zod validation; one repair retry; SDK retries for 429/5xx; timeouts; token-usage logging |
| Planner grounding | Server-side SSRF-safe homepage probe (headings, links, buttons, forms) so plans don't invent features |
| Kane worker | Separate Node service: bearer auth, SSRF re-check before every launch, `spawn` with argv (no shell), per-test temp dir and Chrome profile, per-test and per-job timeouts, global concurrency limit, live step streaming, callbacks with retries, `GET /jobs/:id` polling, `/health` |
| Kane parser | Built from observed output and the official README; tested against real captured output |
| Result layers | `test_results` (Kane) and `ai_analyses` (Groq) stored separately; the AI never changes the status; verdicts are never downgraded by late events |
| Results dashboard | Live pipeline, summary cards, health score with formula explainer, AI summary, per-test cards (browser outcome vs AI interpretation, expected/observed/fix, duration, evidence, execution log with raw NDJSON and stderr), previous attempts |
| Retest loop | Retest failed or all → Groq writes focused objectives from Kane's previous output → Kane re-runs → verification history matrix (Resolved / Recurring / Regressed) → `VERIFIED` status |
| Health score | Weighted (3/2/1) over conclusive verdicts only; withheld when there is insufficient data; explained in the UI and the report |
| Demo website | `/demo` (fictional "Quillstack"); mode read server-side per request; broken mode = dead CTA, contact form without confirmation, "Pricing" nav → /about |
| History | All inspections, per-website cards with score delta, resolved and recurring counts |
| Reports | Markdown and JSON download |
| Persistence | Supabase repository plus a local JSON-file repository for development |
| Security | SSRF (API, worker, every redirect hop), DNS resolution checks, request validation (Zod), rate limiting, constant-time secret checks, server-only secrets (`server-only`), RLS with no anon access |
| Settings | Live integration status (Groq, storage, worker, Kane version and auth, SSRF allowlist) |
| Deployment | `.env.example` files, `worker/Dockerfile`, `docs/DEPLOYMENT.md`, SQL migration |
| Brand / logo | Official mark redrawn as vector from the supplied artwork (C frame + crown + sparkle), recoloured to the site palette: `public/brand/` (SVG + transparent 1024px PNGs, light and on-dark variants), `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` |
| UI redesign (light) | Restyled from the provided reference: white canvas on a lavender frame, slim icon rail, top bar with search pill and black pill CTA, huge-number hero + blurred heat bar (pass rate / health score), divider stat rows with icon chips, list rows with progress rings, segmented toggle, hexagonal "Quality map" flower. Every visual is driven by real data (category pass rates, conclusive rate, fix-verification rate); empty data renders as grey "—" |

## 🔬 Verification evidence

| Check | Result |
|---|---|
| `npm test` | **63/63 passing**: Kane parser (incl. real captured output), SSRF (37 cases), scoring, Groq client recovery (mocked SDK), closed-loop orchestration (FAILED → retest → PASSED → VERIFIED) |
| `npm run typecheck`, `npm run lint` | Clean |
| `next build` | Succeeds with no warnings |
| Worker `tsc` build | Succeeds |
| SQL migration | Applied to real Postgres (PGlite). Upsert conflict targets, CHECK constraints, RLS flags and cascade deletes verified |
| Real Kane CLI | `kane-cli 0.10.7` installed and run manually. Observed: `stream_start` + `recording_state`, no `run_end`, stderr `Not authenticated…`, **exit 1** (docs say 2). Parser built accordingly |
| Live end-to-end (local) | App + worker running. Inspection of `/demo` → probe → plan → worker → **4 real `kane-cli` processes** → callbacks → ERROR(auth) stored with raw NDJSON/stderr → system analysis → finalised `incomplete`, score withheld. Retest created run 2 (parent = run 1) and re-executed through the real worker |
| SSRF (live) | API rejected 127.0.0.1, 169.254.169.254, `file://`, localhost:8787, `[::1]`, 10.0.0.1, `http://2130706433/`; worker independently returned 422 for 169.254.169.254; unauthenticated worker and callback calls → 401 |
| Demo site defects (Playwright, fixture check only) | Broken: Pricing → `/demo/about`, CTA stays on `/demo`, no contact confirmation. Healthy: `/demo/pricing`, `/demo/signup`, confirmation shown |
| UI | Redesign reviewed via desktop + iPhone 13 screenshots of every page (empty real data, plus a throwaway synthetic QA database in a scratch dir for populated states — never committed); 0 console/page errors; no horizontal overflow |

## ⏳ Not yet verified (blocked on credentials, not code)

- A Kane run that produces a real `run_end` (PASSED/FAILED) against the demo site. Needs TestMu AI credentials on the worker.
- Live Groq responses with `openai/gpt-oss-120b` structured output. Needs `GROQ_API_KEY`; the Groq API host was also blocked by this build sandbox's network policy.
- Supabase runtime. The migration is verified on Postgres, but no Supabase project was available.
- Deployed Vercel + worker. **Nothing is deployed yet.**
- `worker/Dockerfile` has not been built (no Docker in this environment).

## 🔑 Required credentials

| Variable | Where | Purpose |
|---|---|---|
| `GROQ_API_KEY` | App | Test planning, analysis, retest planning, summaries |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | App | Persistent storage |
| `KANE_WORKER_SECRET` | App + worker | App ↔ worker auth (generate: `openssl rand -hex 24`) |
| `KANE_WORKER_URL`, `CECH_APP_URL` | App / worker | Service URLs |
| `LT_USERNAME`, `LT_ACCESS_KEY` | Worker | Kane CLI authentication (TestMu AI → Settings → Keys) |

## 🐞 Known issues and limitations

- Rate limiting is per instance and in memory, and keys on `x-forwarded-for` (trustworthy on Vercel, spoofable when self-hosted without a proxy).
- Worker job state is in memory. A worker restart loses in-flight jobs, which CECH detects and records as `ERROR (worker)`.
- Residual DNS-rebinding window between the worker's check and Chrome's lookup. Run the worker with egress firewalling for strict isolation.
- The demo mode is global. Two people demoing at once share one switch.
- Kane evidence: CECH stores the `test_url` (TestMu dashboard link) or the worker `session_dir` path. Evidence packs stay on the worker host and are not uploaded to CECH.
- The homepage probe reads server-rendered HTML only, so client-rendered forms aren't seen; the planner is told this.

## Next steps

1. Add the credentials above, set `KANE_HEADLESS=false` locally, and run the demo script in README.md (broken → retest after healthy). Record the result here.
2. Create the Supabase project and apply the migration.
3. Deploy the worker (Dockerfile) and the app (Vercel), then run the smoke test in docs/DEPLOYMENT.md.
4. Optional (P2): auth plus per-user RLS policies, and per-session demo mode.
