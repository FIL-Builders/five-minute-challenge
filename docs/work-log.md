# Work Log

Local running log for benchmark-repo development.

## 2026-03-05

### Repository Reframe

- Preserved the initial successful manual run under `historical-runs/2026-03-04-initial-manual/`.
- Rewrote the repo README around the benchmark-harness objective.
- Added benchmark design documentation and the first draft of the canonical result schema.
- Updated the active prompt to require fresh wallet generation and self-funding rather than inheriting a local private key.
- Committed the baseline cleanup as `1a5e4c6` with message `Add benchmark roadmap and archive initial run`.

### Tracking Upgrade

- Promoted `docs/roadmap.md` into a maintained execution checklist.
- Added this `docs/work-log.md` file so implementation progress can be recorded locally as work lands.

### Phase 1 Harness Start

- Added `bin/run-benchmark.sh` as the local benchmark harness entry point.
- Added `scripts/finalize-run.mjs` to finalize per-run metadata and produce `run-summary.json`.
- Switched `run.sh` to act as the local manual scheduler entry point for the harness.
- Updated the prompt so the agent writes `report.md` and `run-result.json` into the current working directory for collection.
- Locked in current implementation assumptions: Filecoin storage as the artifact backend target, local dev server first for the dashboard, and local script invocation as the initial scheduler.

### Phase 2 Validator Start

- Added `scripts/validate-run.mjs` as a dependency-free validator for `run-summary.json`.
- Wired finalization to invoke the validator and write `validation-result.json` into each run directory.
- Switched run scoring to derive final status and failure phase from structured evidence instead of trusting agent self-reporting alone.
- Verified validator behavior with both a synthetic success case and a synthetic failure case.

### Phase 3 Mode And Prompt Versioning

- Added explicit versioned prompts under `prompts/`.
- Taught the harness to map benchmark mode to a default prompt version.
- Added run-time docs snapshot capture and SHA-256 hashing before agent launch.
- Added docs snapshot hash, mode, and prompt version to run artifacts and summary metadata.

### Phase 4 Dashboard Start

- Added `dashboard/schema.json` as the canonical Token Host Builder schema for the benchmark registry app.
- Added `BenchmarkRun`, `BenchmarkIncident`, and `BenchmarkConfig` collections to support run history, operator triage, and local configuration.
- Added `bin/generate-dashboard.sh` and `npm run dashboard:generate` to generate the local dashboard scaffold from the sibling Token Host Builder repo.
- Verified that the schema generates successfully into `dashboard/generated/`.
- Added `bin/dev-dashboard.sh` and `npm run dashboard:dev` as the local Calibration preview entry point.
- Added `scripts/build-dashboard-records.mjs` so each run can emit dashboard-ready records.
- Added `scripts/build-dashboard-feed.mjs` and `npm run dashboard:feed` to aggregate local run outputs into `dashboard/local-feed.json`.
- Customized the generated dashboard UI into a feed-backed benchmark overview with success rate and p50/p95 latency stats.
- Added a static `/run?id=<runId>` detail page that renders key evidence, timings, and operator notes from the local feed.
- Verified the customized generated UI builds successfully with `pnpm build`.

### Phase 5 Local Scheduling And Alerts

- Added `scripts/check-alerts.mjs` to evaluate success rate, p95 wall time, and consecutive-failure thresholds against the local dashboard feed.
- Added `bin/run-local-cycle.sh` and `npm run benchmark:cycle` to run the benchmark, rebuild the feed, and evaluate alerts in one local cycle.
- Added `npm run benchmark:alerts` for threshold evaluation without a new benchmark run.
- Added structured alert outputs under ignored `alerts/`, including alert history when thresholds are breached.
- Scrubbed `PRIVATE_KEY` and related deploy wallet variables from the benchmarked agent subprocess environment.
- Added `scripts/upload-run-artifacts.mjs` so the local cycle can publish `workspace-output.tgz` to Filecoin Cloud using the dev wallet after the benchmark run finishes.

### Artifact Publish Reconciliation

- Fixed post-publish state handling so artifact publishing re-runs `validate-run.mjs` after updating `run-summary.json`.
- Added `scripts/lib/reconcile-run-summary.mjs` so both finalization and post-publish reconciliation derive status, failure phase, and operator notes from the same logic.
- Closed the stale-status gap where dashboard records could keep reflecting an old `validation-result.json` after a successful artifact upload.

### Successful Fresh Run And Harness Normalization

- Ran a new full local benchmark cycle for run `20260305T205630Z-fa9abd`.
- Confirmed a successful fresh-wallet end-to-end agent run with funding, deposit, upload, download, and integrity verification on Calibration.
- Updated `scripts/finalize-run.mjs` to normalize the newer agent result shape (`success`, `wallet`, `funding`, `deposit`, `upload`, `download`, `phaseTimings`, and named artifact files).
- Updated `scripts/validate-run.mjs` to avoid treating `agentExitCode: null` as an automatic boot failure during repair/replay scenarios.
- Tightened `bin/run-benchmark.sh` to launch Codex in a scrubbed environment so unrelated operator secrets are not inherited by the benchmarked agent.

### Benchmark Registry Support And Artifact Links

- Hardened `tokenhost-builder` so the benchmark registry schema compiles and deploys cleanly by combining `viaIR` fallback with lower-stack generated create flows and struct-based create inputs.
- Extended the benchmark registry schema with `artifactBundleHttpUrl` and redeployed it to Filecoin Calibration at `0xb0b97c5f2cfebe842ba7a1b38cde1893ec06e517`.
- Added `scripts/publish-dashboard-records.mjs` and `npm run dashboard:publish` so finalized run records can be written into the deployed `BenchmarkRun` collection.
- Published run `20260305T205630Z-fa9abd` into the on-chain registry as `BenchmarkRun` record `#1`.
- Added HTTP-served local artifact links to the custom dashboard run detail view for reports, logs, summaries, validation output, and publish metadata.
- Switched the customized dashboard source app away from static export mode so Next route handlers can serve local run artifacts during development.
- Updated `bin/up-dashboard-app.sh` to skip the preview server so successful deployments do not report false failures when port `3001` is already in use.

### Additional Run, Anti-Abuse Guardrails, And Publish Recovery

- Redeployed the benchmark registry after the Token Host generator/compiler improvements to Filecoin Calibration at `0x74af3ad6de10623f909b11c6d9ed27dfea59533a`.
- Started an additional benchmark cycle and terminated the first attempt after the agent began exploring proxy-based anti-abuse evasion; tightened the benchmark prompt to forbid proxies, CAPTCHA-solving services, and other rate-limit bypasses.
- Ran a replacement compliant benchmark cycle for run `20260305T223418Z-b085f4`; the agent generated a fresh wallet, but the run failed at funding because official/publicly documented faucet paths remained blocked by anti-bot controls in a non-interactive environment.
- Uploaded the failed run bundle to Filecoin Cloud with retrieval URL `https://calib.ezpdpz.net/piece/bafkzcibe6tdbyd7thupd2ivoroytcf2l5woacvkomf2cw5kh6xvvaqbli63mbgw3cm`.
- Updated `scripts/finalize-run.mjs` to normalize agent result states like `blocked`, `partial`, and `incomplete` into canonical benchmark `failure` status so the harness can score early-documentation and faucet failures without schema drift.
- Hardened `scripts/publish-dashboard-records.mjs` so interrupted or partial on-chain publication can be recovered from chain state, and updated `bin/run-local-cycle.sh` to continue rebuilding the local feed and alerts even when a later stage fails.
- Recovered the interrupted publication state for run `20260305T223418Z-b085f4`; it now appears on-chain in the new registry as `BenchmarkRun` record `#1` with incident records `#1` through `#5`.
