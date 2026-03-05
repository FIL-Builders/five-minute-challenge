# Execution Checklist

This file is the maintained delivery checklist for the benchmark repo.

Update rules:
- mark completed items with `[x]`
- mark active work with `[ ]` plus a short `Status:` note beneath the section
- append meaningful work notes to `docs/work-log.md` when a task starts, lands, or changes direction

## Objective

Turn this repo from a one-off agent experiment into a durable benchmark and monitoring system for Filecoin Cloud getting-started readiness.

The benchmark should answer:
- Can an agent independently follow the getting-started guide from scratch?
- Can it generate a new wallet, fund it, upload a file, download it, and verify byte-level integrity?
- How long does the full run take from harness start to harness finish?
- Where do runs fail over time?
- What feedback keeps recurring across models, prompt versions, and docs revisions?

## Principles

- [x] Measure the whole experience, not just a helper script.
- [x] Benchmark in a fresh workspace so prior artifacts do not contaminate the result.
- [x] Require a fresh wallet for each run.
- [x] Treat structured JSON evidence as the source of truth.
- [x] Preserve human-readable reports, but never score success from prose alone.
- [x] Keep large logs and artifacts off-chain; publish compact run summaries and content hashes.

## Phase 0: Repo Cleanup And Benchmark Framing

Status: baseline framing complete

- [x] Preserve the March 4, 2026 run as a historical example.
- [x] Document the target benchmark architecture.
- [x] Define the canonical run result schema.
- [x] Update the active prompt to require fresh-wallet generation and self-funding.
- [x] Add a maintained local work log for ongoing execution notes.

## Phase 1: Canonical Local Harness

Status: in progress

- [x] Add `bin/run-benchmark.sh` or equivalent harness entry point.
- [x] Run each benchmark in a fresh temporary workspace.
- [x] Record outer wall-clock timing at harness level.
- [x] Capture stdout, stderr, exit code, timestamps, and artifact bundle paths.
- [x] Write canonical outputs into `runs/<run-id>/`.
- [x] Fail the run if required evidence files are missing.
- [x] Record both outer runtime and agent-reported phase data.

## Phase 2: Result Validation And Scoring

Status: baseline validator complete

- [x] Draft the JSON schema for `run-result.json`.
- [x] Implement schema validation.
- [x] Implement pass/fail evaluation from structured evidence only.
- [x] Add failure taxonomy handling for `agent_boot`, `wallet_generation`, `funding`, `deposit`, `upload`, `download`, `verification`, and `artifact_validation`.
- [x] Mark malformed or partial outputs as `invalid`.

## Phase 3: Repeatable Benchmark Modes

Status: baseline mode/version support complete

- [x] Add `fresh-follow-docs` mode for true agent ability benchmarking.
- [x] Add `inherited-key-follow-docs` mode for pre-provisioned wallet benchmarking.
- [x] Add `scripted-regression` mode for infrastructure sanity checks.
- [x] Version prompts explicitly.
- [x] Capture docs URL and docs snapshot hash in results.
- [x] Ensure mode, prompt version, and repo revision are visible on every run.

## Phase 4: Dashboard And History

Status: local plus chain-backed baseline complete

- [x] Stand up a benchmark run registry app schema.
- [x] Generate and review the local dashboard scaffold.
- [x] Build a local dashboard feed from benchmark run outputs.
- [x] Add a run detail page with evidence links, timings, and failure phase.
- [x] Add aggregate views for success rate and latency trends.
- [x] Add operator notes and tagged incidents.
- [x] Make benchmark history queryable over time.
- [x] Make a single failed run inspectable without opening raw logs first.
- [x] Deploy the benchmark registry schema to Filecoin Calibration.
- [x] Publish at least one finalized `BenchmarkRun` record into the deployed registry.
- [x] Expose local artifact links from the dashboard over HTTP instead of only showing piece CIDs.

## Phase 5: Scheduling And Alerting

Status: local baseline complete

- [x] Add a scheduled runner.
- [x] Add alert thresholds for success rate and p95 wall time.
- [x] Add a simple incident workflow for recurrent failures.
- [x] Ensure runs happen without manual intervention.
- [x] Ensure alerts link directly to failing runs.

## Near-Term Order

- [x] Build the local harness.
- [x] Build the result validator.
- [x] Add prompt versioning and benchmark modes.
- [x] Stand up the run registry app using the Token Host Builder stack.
- [x] Add scheduling only after local benchmark output is stable.

## Explicit Non-Goals For The Next Iteration

- [x] Do not optimize for perfect multi-model orchestration yet.
- [x] Do not store full logs on-chain.
- [x] Do not attempt fully autonomous production-grade secret management in this repo yet.
- [x] Do not score subjective report quality beyond basic operator notes yet.
