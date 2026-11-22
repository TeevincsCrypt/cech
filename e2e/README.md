# Proof of Fix — end-to-end harness

`run-pof-e2e.mjs` drives the Quillstack demo flow through CECH's public HTTP API:

**Broken mode → inspection → evidence capture → Healthy mode → exact retest → Proof of Fix (PDF / Markdown / JSON).**

It asserts real outcomes at each step, for example that the Pricing link lands on `/demo/about`, that the dead CTA logs a real console error, and that the broken contact form produces a real 404. It saves the evidence and reports to `$OUT`.

## What is real, and what is a test double

| Component | In this harness |
|---|---|
| CECH app (API, orchestration, storage, verification engine, PDF) | **Real** (`next start`) |
| Kane worker (job API, evidence session, artifact endpoint, callbacks) | **Real** (`worker/`) |
| Chrome, screenshots, URLs, console errors, failed requests | **Real**: captured over CDP from the live Quillstack pages |
| Quillstack demo site, Broken/Healthy switch | **Real** |
| `kane-cli` | **Test double** `doubles/kane-double.mjs`: same CLI contract, connects to the worker's browser via `--cdp-endpoint`, really performs the interaction, and reports pass/fail only from what the browser shows |
| Groq API | **Test double** `doubles/groq-double.mjs`: deterministic answers derived from CECH's prompts; bug reports cite only evidence ids present in the prompt |

The doubles exist because real Kane needs TestMu AI credentials and cloud access, and `api.groq.com` is unreachable from the build sandbox. **Never use them in production.**

To check the **real** Kane path, run the driver with `--real-kane` against a worker using the real `kane-cli`. It verifies that outcomes stay honest and that evidence is captured alongside Kane. On a worker that is logged in to Kane, run the normal mode with no doubles.

## Run it

```bash
SECRET=$(openssl rand -hex 24)
node e2e/doubles/groq-double.mjs &                                   # :4011
(cd worker && KANE_CLI_BIN=$PWD/../e2e/doubles/kane-double.mjs KANE_WORKER_SECRET=$SECRET \
  CECH_APP_URL=http://localhost:3100 SSRF_ALLOWLIST=localhost:3100 PORT=8787 npx tsx src/server.ts) &
npm run build && GROQ_API_KEY=test-double GROQ_BASE_URL=http://127.0.0.1:4011 \
  KANE_WORKER_URL=http://localhost:8787 KANE_WORKER_SECRET=$SECRET CECH_APP_URL=http://localhost:3100 \
  SSRF_ALLOWLIST=localhost:3100 CECH_LOCAL_DATA_FILE=/tmp/pof/db.json CECH_ARTIFACT_DIR=/tmp/pof/artifacts \
  npx next start -p 3100 &
APP=http://localhost:3100 OUT=/tmp/pof/out node e2e/run-pof-e2e.mjs
```

The double sits at `e2e/doubles/kane-double.mjs` and imports playwright-core from `/home/user/cech/worker/node_modules`. Adjust that path if your checkout lives elsewhere.
