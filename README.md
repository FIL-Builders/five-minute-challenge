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

## Active Entry Point

Local execution now goes through [bin/run-benchmark.sh](/home/mikers/dev/fil-builders/five-minute-challenge/bin/run-benchmark.sh), which creates a fresh temporary workspace, launches Codex, captures outer timing, and writes run artifacts under ignored `runs/<run-id>/` directories.

Current environment assumptions:
- artifact publishing backend target will be the Filecoin storage service under test
- dashboard development can run locally first against Filecoin Calibration
- scheduling can remain a locally invoked script until the harness output stabilizes
