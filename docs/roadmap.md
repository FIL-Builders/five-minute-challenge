# Roadmap

## Objective

Turn this repo from a one-off agent experiment into a durable benchmark and monitoring system for Filecoin Cloud getting-started readiness.

The benchmark should answer:
- Can an agent independently follow the getting-started guide from scratch?
- Can it generate a new wallet, fund it, upload a file, download it, and verify byte-level integrity?
- How long does the full run take from harness start to harness finish?
- Where do runs fail over time?
- What feedback keeps recurring across models, prompt versions, and docs revisions?

## Principles

1. Measure the whole experience, not just a helper script.
2. Benchmark in a fresh workspace so prior artifacts do not contaminate the result.
3. Require a fresh wallet for each run.
4. Treat structured JSON evidence as the source of truth.
5. Preserve human-readable reports, but never score success from prose alone.
6. Keep large logs and artifacts off-chain; publish compact run summaries and content hashes.

## Phases

### Phase 0: Repo cleanup and benchmark framing

Status: in progress

Deliverables:
- preserve the March 4, 2026 run as a historical example
- document the target architecture
- define the canonical run result schema
- update the active prompt to require fresh-wallet generation and self-funding

### Phase 1: Canonical local harness

Deliverables:
- `bin/run-benchmark.sh` or equivalent harness entry point
- fresh temporary workspace per run
- outer wall-clock measurement at harness level
- captured stdout/stderr, exit code, timestamps, artifact bundle
- canonical output directory per run, e.g. `runs/<run-id>/`

Acceptance criteria:
- no benchmark run writes its primary results into the repo root
- harness fails the run if required evidence files are missing
- harness records both outer runtime and agent-reported phase data

### Phase 2: Result validation and scoring

Deliverables:
- JSON schema validation for `run-result.json`
- pass/fail evaluator
- failure taxonomy: `agent_boot`, `wallet_generation`, `funding`, `deposit`, `upload`, `download`, `verification`, `artifact_validation`

Acceptance criteria:
- run success is derived from structured evidence only
- malformed or partial outputs are marked invalid rather than manually interpreted

### Phase 3: Repeatable benchmark modes

Deliverables:
- `fresh-follow-docs` mode: true agent ability benchmark
- `scripted-regression` mode: infrastructure sanity check
- prompt versioning
- docs URL and docs snapshot hash captured in results

Acceptance criteria:
- operators can distinguish agent-reasoning regressions from service regressions
- mode, prompt version, and repo revision are visible on every run

### Phase 4: Dashboard and history

Deliverables:
- benchmark run registry app
- run detail page with evidence links, timings, and failure phase
- aggregate views for success rate and latency trends
- operator notes and tagged incidents

Acceptance criteria:
- benchmark history is queryable over time
- a single failed run can be inspected without opening raw logs first

### Phase 5: Scheduling and alerting

Deliverables:
- scheduled runner
- alerting thresholds for success rate and p95 wall time
- simple incident workflow for recurrent failures

Acceptance criteria:
- runs happen without manual intervention
- operators receive actionable alerts with links to the failing run

## Near-Term Execution Order

1. Build the local harness and result validator.
2. Add prompt versioning and benchmark modes.
3. Stand up the run registry app using the Token Host Builder stack.
4. Add scheduling only after local benchmark output is stable.

## Explicit Non-Goals For The Next Iteration

- perfect multi-model orchestration
- storing full logs on-chain
- fully autonomous production-grade secret management in this repo
- scoring subjective report quality beyond basic operator notes
