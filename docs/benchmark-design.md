# Benchmark Design

## Benchmark Shape

The benchmark should evaluate an agent's ability to follow the public Filecoin Cloud getting-started flow in a clean environment.

Each benchmark run should:
1. create a fresh temporary workspace
2. provide the agent with the benchmark prompt and any non-secret runtime configuration
3. require the agent to generate a brand new private key locally
4. require the agent to fund that wallet using the getting-started path and related public instructions
5. require deposit, upload, download, and integrity verification
6. validate structured outputs after the agent exits

The harness, not the agent, is responsible for the official run timing and scoring.

## Fresh Wallet Requirement

Future benchmark runs must not rely on a pre-provisioned `PRIVATE_KEY` discovered in the environment.

Required behavior:
- the agent generates a fresh wallet during the run
- the run records the generated wallet address
- the agent funds that wallet using the public getting-started flow and any linked public faucet guidance
- the resulting upload/download evidence must be tied to that run's unique wallet and payload

Why this matters:
- it measures real onboarding ability instead of privilege inheritance
- it avoids false confidence caused by hidden local setup
- it better matches the experience of a new external developer

## Measurement Model

There are two timing layers.

### Canonical timing

Recorded by the harness:
- `startedAt`
- `endedAt`
- `outerWallTimeMs`

This is the primary benchmark latency measure and includes:
- model inference time
- tool calls
- retries
- local script execution
- waiting for chain and storage operations

### Supplemental timing

Recorded by the agent or generated helper scripts:
- `agentPhaseData[]`

This is useful for diagnosis, but it must never replace outer wall time as the benchmark headline.

## Artifacts

Every run should produce a dedicated folder with:
- `run-result.json`
- `report.md`
- `agent.log`
- `stdout.log`
- `stderr.log`
- `uploaded-payload.txt`
- `downloaded-payload.txt`
- optional helper scripts the agent wrote

The payload should include a unique `runId` so success cannot be replayed from an older upload.

## Validation Rules

A run is successful only if all of the following are true:
- schema validation passes
- agent exit code is zero
- a new wallet address is present
- a funding event is evidenced
- deposit or approval evidence is present when required by the guide flow
- upload evidence includes `pieceCid`
- download evidence exists
- content hashes match

## Storage And Dashboard Direction

Use a generated Token Host Builder app as the run registry UI and summary store.

Recommended split:
- on-chain or app-record summary: run id, mode, model, timestamps, status, failure phase, tx hash, piece CID, artifact bundle CID/hash
- off-chain artifact bundle: raw logs, report, payloads, helper scripts, validator output

Reasoning:
- history becomes easy to browse
- expensive and bulky logs stay off-chain
- the system dogfoods Filecoin storage for retained evidence

Current implementation decisions:
- the artifact publishing backend target is the Filecoin storage service under test
- the dashboard can start as a local dev server and later move to a Vercel or Netlify style hosted frontend
- the initial scheduler is just a locally invoked script rather than a hosted cron system

## Benchmark Modes

Current planned modes:
- `fresh-follow-docs`: benchmark true from-scratch agent ability against the public getting-started flow
- `scripted-regression`: benchmark harness and infrastructure stability with more deterministic agent behavior

Each run should record:
- `mode`
- `promptVersion`
- `docsUrl`
- `docsSnapshotHash`

This lets operators distinguish:
- docs changes vs service changes
- prompt regressions vs model regressions
- agent reasoning failures vs infrastructure failures

## Local Scheduling And Alerts

The first scheduler/alerting layer is intentionally local:
- a local cycle runner invokes the benchmark, rebuilds the dashboard feed, and checks thresholds
- alert evaluation writes structured JSON for the latest alert result and alert history
- alert payloads include direct run summary paths so operators can jump from an alert to the implicated runs

Initial local alert thresholds:
- minimum success rate across a recent window
- maximum p95 wall time
- maximum consecutive non-success runs

## Data Model Sketch

Suggested collections for the app:
- `benchmarkRuns`
- `benchmarkIncidents`
- `benchmarkConfigs`

Minimum `benchmarkRuns` fields:
- `runId`
- `mode`
- `promptVersion`
- `model`
- `repoSha`
- `docsUrl`
- `docsSnapshotHash`
- `status`
- `failurePhase`
- `startedAt`
- `endedAt`
- `outerWallTimeMs`
- `walletAddress`
- `txHash`
- `pieceCid`
- `contentMatch`
- `artifactBundleUri`
- `artifactBundleHash`

Current repo implementation:
- [dashboard/schema.json](/home/mikers/dev/fil-builders/five-minute-challenge/dashboard/schema.json) defines `BenchmarkRun`, `BenchmarkIncident`, and `BenchmarkConfig`
- [bin/generate-dashboard.sh](/home/mikers/dev/fil-builders/five-minute-challenge/bin/generate-dashboard.sh) generates the local dashboard scaffold from that schema using the sibling Token Host Builder repo
- [scripts/build-dashboard-records.mjs](/home/mikers/dev/fil-builders/five-minute-challenge/scripts/build-dashboard-records.mjs) converts validated runs into dashboard-ready records
- [scripts/build-dashboard-feed.mjs](/home/mikers/dev/fil-builders/five-minute-challenge/scripts/build-dashboard-feed.mjs) aggregates local run records into a feed for local dashboard development

## Historical Example

The first successful manual run is preserved in:
- [historical-runs/2026-03-04-initial-manual/report.md](/home/mikers/dev/fil-builders/five-minute-challenge/historical-runs/2026-03-04-initial-manual/report.md)

That run is useful as baseline evidence and a design reference, but it should not be treated as the final benchmark shape because it depended on a locally available private key and wrote results directly into the working tree.
