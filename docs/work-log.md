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
