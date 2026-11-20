# CECH Kane worker

A standalone Node.js service that executes CECH test objectives with **Kane CLI** in a real Chrome browser and reports the real outcomes back to CECH.

## How a test runs

1. `POST /jobs` is authenticated with a bearer token and its body is validated.
2. The URL is re-validated (SSRF) on the API call and **again immediately before each browser launch**.
3. Each objective runs as:
   ```
   kane-cli run <objective> --url <url> --agent --mode testing --timeout <s> --max-steps <n> --chrome-profile <tmp> [--headless]
   ```
   It is spawned with an argv array (`shell: false`) in its own temporary directory and process group.
4. stdout NDJSON is parsed incrementally, and live steps are forwarded as `test_progress` events.
5. The final outcome comes from `parseKaneOutput()` (`src/kane-parser.ts`).

## Output contract (kane-cli 0.10.7, observed and documented)

| Event | Shape |
|---|---|
| start | `{"type":"stream_start","cli_version":"0.10.7",...}` |
| progress | `{"step":N,"status":"running"\|"done"\|"failed","remark":"..."}` (untyped) |
| error | `{"type":"error","message":"..."}` |
| verdict | `{"type":"run_end","status":"passed"\|"failed","summary","reason","duration","session_dir","test_url",...}` |

**Observed:** when Kane is not authenticated, it prints `Not authenticated...` to stderr, emits no `run_end`, and exits with code **1** (the docs say 2). The worker therefore never infers PASSED or FAILED from the exit code alone. A verdict requires `run_end`. The real captured output is in `test/fixtures/`.

| Status | Rule |
|---|---|
| PASSED | `run_end.status = passed` and exit code 0 |
| FAILED | `run_end.status = failed`, not a timeout, not a site access wall |
| TIMEOUT | worker hard-kill, exit code 3, or `run_end.reason` starting with "Timeout:" |
| INCONCLUSIVE | ambiguous `run_end`, or the site blocked automation (captcha, login wall) |
| ERROR | no `run_end`: auth / browser / network / worker failure (`errorKind` says which) |

## Configuration

See `.env.example`. The key variables are `KANE_WORKER_SECRET`, `CECH_APP_URL`, `LT_USERNAME` and `LT_ACCESS_KEY` (used once at startup for `kane-cli login`), plus the limits: `KANE_TEST_TIMEOUT_SEC`, `KANE_JOB_TIMEOUT_SEC` and `KANE_MAX_CONCURRENCY`.

## Run

```bash
npm install
npm run dev            # tsx watch; loads .env
npm run build && npm start
```
