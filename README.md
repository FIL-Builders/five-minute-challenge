# Filecoin Cloud Agent Benchmark

This repo is becoming the benchmark harness for Filecoin On Chain Cloud launch readiness.

The benchmark goal is simple:
- run an agent regularly against the Filecoin Cloud getting-started guide
- require the agent to generate a fresh wallet, fund it, upload a file, download it, and prove integrity
- measure true end-to-end wall time, including agent inference and tool use
- retain structured evidence and operator-readable feedback over time

## Current State

What exists today:
- a canonical local harness that runs Codex in a fresh workspace and writes normalized run artifacts under `runs/<run-id>/`
- structured validation, dashboard record generation, local feed aggregation, and alert evaluation
- Filecoin Cloud artifact bundle publishing for retained benchmark evidence
- a Token Host Builder benchmark registry schema deployed on Filecoin Calibration
- local dashboard views that combine feed-backed operator metrics with chain-backed collection pages
- one preserved historical manual run plus newer validated benchmark runs under ignored `runs/`

Historical evidence lives in [historical-runs/2026-03-04-initial-manual](/home/mikers/dev/fil-builders/five-minute-challenge/historical-runs/2026-03-04-initial-manual).

## Working Direction

The active repo direction is documented here:
- [docs/roadmap.md](/home/mikers/dev/fil-builders/five-minute-challenge/docs/roadmap.md)
- [docs/work-log.md](/home/mikers/dev/fil-builders/five-minute-challenge/docs/work-log.md)
- [docs/benchmark-design.md](/home/mikers/dev/fil-builders/five-minute-challenge/docs/benchmark-design.md)
- [schemas/benchmark-run-result.schema.json](/home/mikers/dev/fil-builders/five-minute-challenge/schemas/benchmark-run-result.schema.json)
- [dashboard/schema.json](/home/mikers/dev/fil-builders/five-minute-challenge/dashboard/schema.json)

## Active Entry Point

Local execution now goes through [bin/run-benchmark.sh](/home/mikers/dev/fil-builders/five-minute-challenge/bin/run-benchmark.sh), which creates a fresh temporary workspace, launches Codex, captures outer timing, and writes run artifacts under ignored `runs/<run-id>/` directories.

Each run now produces:
- `run-summary.json`: harness-normalized result record
- `validation-result.json`: validator output derived from structured evidence
- `dashboard-records.json`: dashboard-ready records derived from the validated run
- `artifact-publish-result.json`: Filecoin artifact publication result when bundle upload is enabled
- `workspace-output.tgz`: captured workspace bundle for later publishing
- `docs-snapshot.html` and `docs-snapshot.sha256` when the guide can be fetched at run start

Prompt versions now live under [prompts/](/home/mikers/dev/fil-builders/five-minute-challenge/prompts), and the harness selects a version from the benchmark `MODE`.

Current benchmark modes:
- `fresh-follow-docs`: agent must generate and fund a fresh wallet
- `inherited-key-follow-docs`: agent inherits `PRIVATE_KEY` from the harness environment and uses that wallet for the guide flow
- `scripted-regression`: deterministic harness sanity mode

Current environment assumptions:
- artifact publishing backend target will be the Filecoin storage service under test
- dashboard development can run locally first against Filecoin Calibration
- scheduling can remain a locally invoked script until the harness output stabilizes

Local operations now support:
- `npm run benchmark:cycle`: run benchmark, publish the workspace bundle, rebuild dashboard feed, then evaluate alerts
- `npm run benchmark:publish`: publish the latest run bundle to Filecoin Cloud using the dev wallet
- `npm run benchmark:alerts`: evaluate local alert thresholds without running a new benchmark
- `PUBLISH_DASHBOARD_APP=1 npm run benchmark:cycle`: also publish the finalized run record into the deployed Token Host registry

## Dashboard

The benchmark dashboard is defined as a Token Host Builder app schema in [dashboard/schema.json](/home/mikers/dev/fil-builders/five-minute-challenge/dashboard/schema.json).

Current dashboard behavior:
- the homepage and `/run?id=<runId>` use the local validated benchmark feed for operator metrics and artifact inspection
- the generated collection routes such as `/BenchmarkRun` and `/BenchmarkIncident` read live records from the deployed Calibration app
- local artifact links are served from the dev dashboard server so reports, logs, summaries, and validation results are clickable over HTTP

Useful commands:
- `npm run dashboard:dev`: start the local Next dashboard with the current manifest, ABI, and feed copied into `public/`
- `npm run dashboard:up`: deploy the dashboard schema to Filecoin Calibration and refresh the generated manifest
- `npm run dashboard:publish`: publish the latest finalized run into the deployed `BenchmarkRun` registry
