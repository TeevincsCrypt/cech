# Deploying CECH

CECH has three deployable parts:

| Part | Where | Why |
|---|---|---|
| Next.js app + API | Vercel | UI, API routes, orchestration, Groq calls |
| Database | Supabase PostgreSQL | Persistent inspections, results, analyses |
| Kane worker | A long-lived Node host (Railway, Fly.io, Render, a VM) | Runs Kane CLI and Chrome. **Not** Vercel: browser runs take minutes and need a real Chrome install. |

## 1. Supabase

1. Create a project.
2. Run `supabase/migrations/20261120000000_init.sql` in the SQL editor, or run `supabase db push` with the CLI.
3. Copy the project URL, the anon key and the **service role** key.

RLS is enabled on every table with no anon or authenticated policies. All reads and writes go through CECH's server using the service-role key, which never reaches the browser.

## 2. Kane worker

Build from `worker/Dockerfile` (Node 22, Google Chrome stable, `@testmuai/kane-cli@0.10.7`):

```bash
cd worker
docker build -t cech-kane-worker .
docker run -p 8787:8787 \
  -e KANE_WORKER_SECRET=... \
  -e CECH_APP_URL=https://your-cech.vercel.app \
  -e LT_USERNAME=... -e LT_ACCESS_KEY=... \
  cech-kane-worker
```

Without Docker: install Chrome and `npm i -g @testmuai/kane-cli`, then run `npm ci && npm run build && npm start` in `worker/`.

Check the worker with `GET /health`. The response includes the kane-cli version, whether Kane is authenticated, the concurrency limit, and the running and queued counts.

Worker API (every route except `/health` requires `Authorization: Bearer $KANE_WORKER_SECRET`):

| Method | Path | |
|---|---|---|
| `GET` | `/health` | Liveness and Kane status (no auth) |
| `POST` | `/jobs` | `{ jobId, url, tests: [{ testCaseId, objective }] }` → 202 |
| `GET` | `/jobs/:id` | Job state and per-test outcomes (used for polling and recovery) |

The worker POSTs `test_started`, `test_progress`, `test_completed` and `job_completed` events to `$CECH_APP_URL/api/worker/callback`. If a callback is lost, the app pulls `GET /jobs/:id` while a report is open, so results are never lost.

## 3. Vercel

Import the repo. Use the Next.js framework preset with the default build command.

Environment variables:

```
GROQ_API_KEY, GROQ_MODEL
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
KANE_WORKER_URL, KANE_WORKER_SECRET
CECH_APP_URL
```

Leave `SSRF_ALLOWLIST` **empty** in production. The demo site is then inspected at its public URL, `https://your-cech.vercel.app/demo`, which passes the normal SSRF checks.

The API routes declare `maxDuration = 60` for planning and result analysis. The Hobby plan allows that.

## 4. Smoke test

1. `/settings` should show every integration as **Ready**, including "Kane authenticated".
2. Run an inspection of `https://your-cech.vercel.app/demo` in broken mode, then switch to healthy mode and retest the failed tests.

## Security notes

- URLs are validated at the API, again in the worker before every browser launch, and on every redirect hop of the homepage probe. Validation covers protocol, embedded credentials, internal hostnames and every DNS-resolved address (private, loopback, link-local/metadata, CGNAT, ULA, NAT64 and mapped IPv6).
- Kane is spawned with an argv array (`shell: false`). Objectives are single argv elements with control characters stripped. Each run gets its own temporary working directory and Chrome profile.
- Remaining risk: DNS rebinding between the worker's check and Chrome's own lookup. Mitigate it by running the worker on an egress-restricted network (block RFC1918 and 169.254.0.0/16).
- Rate limiting is in-memory per instance. Use a shared store (Upstash/Redis) if you need strict global limits.
