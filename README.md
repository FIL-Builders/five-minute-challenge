# Filecoin Cloud Agent Benchmark

This repo is becoming the benchmark harness for Filecoin On Chain Cloud launch readiness.

The benchmark goal is simple:
- run an agent regularly against the Filecoin Cloud getting-started guide
- require the agent to generate a fresh wallet, fund it, upload a file, download it, and prove integrity
- measure true end-to-end wall time, including agent inference and tool use
- retain structured evidence and operator-readable feedback over time

## Current State

What exists today:
- one successful manual Codex-driven run, preserved as a historical example
- a draft benchmark prompt
- no canonical harness, schema validator, scheduler, or dashboard yet

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

Current environment assumptions:
- artifact publishing backend target will be the Filecoin storage service under test
- dashboard development can run locally first against Filecoin Calibration
- scheduling can remain a locally invoked script until the harness output stabilizes

Local operations now support:
- `npm run benchmark:cycle`: run benchmark, rebuild dashboard feed, then evaluate alerts
- `npm run benchmark:publish`: publish the latest run bundle to Filecoin Cloud using the dev wallet
- `npm run benchmark:alerts`: evaluate local alert thresholds without running a new benchmark

## Dashboard

The first dashboard slice is now defined as a Token Host Builder app schema in [dashboard/schema.json](/home/mikers/dev/fil-builders/five-minute-challenge/dashboard/schema.json). Generate the local app scaffold with `npm run dashboard:generate`, build a local aggregate feed with `npm run dashboard:feed`, and run a Calibration-targeted local preview with `npm run dashboard:dev` once a dev private key is available.
