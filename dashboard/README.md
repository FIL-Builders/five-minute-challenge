# Benchmark Registry Dashboard

This directory defines the Token Host Builder app for benchmark history and operator inspection.

## Files

- `schema.json`: canonical THS schema for the run registry app

## Current Scope

The app currently models:
- `BenchmarkRun`: one row per validated benchmark run
- `BenchmarkEvidence`: one row per run for evidence-level verification fields
- `BenchmarkArtifacts`: one row per run for bundle and index retrieval metadata plus the on-chain published-artifact manifest
- `BenchmarkFeedback`: one row per run for structured operator feedback
- `BenchmarkIncident`: operator-tracked incidents tied to runs
- `BenchmarkConfig`: lightweight benchmark configuration records

## Local Workflow

Generate the app scaffold:

```bash
./bin/generate-dashboard.sh
```

That writes generated output under `dashboard/generated/`.

Build a local aggregate artifact from benchmark runs for auxiliary tooling:

```bash
npm run dashboard:feed
```

That writes `dashboard/local-feed.json` from `runs/*/dashboard-records.json`, scoped to the current deployed registry by default so old deployments do not leak into the active dashboard. It is kept only for non-UI tooling such as alerting; the dashboard pages themselves read directly from on-chain Token Host collections and no longer ship or fetch `benchmark-feed.json`.

Run the local dashboard UI against the current generated Token Host app:

```bash
npm run dashboard:dev
```

Defaults:
- host: `127.0.0.1`
- port: `3001`

This serves the already-generated Next UI from `dashboard/generated/ui` against the current manifest and deployed contract state.

If you want to compile/deploy the Token Host Builder app schema against Calibration instead, run:

```bash
PRIVATE_KEY=0x... npm run dashboard:up
```

Defaults for schema deployment:
- host: `127.0.0.1`
- port: `3001`
- chain: `filecoin_calibration`
- wallet env: `PRIVATE_KEY` by default, or `DASHBOARD_PRIVATE_KEY` to override

History republish helpers:

```bash
npm run dashboard:republish-history
npm run dashboard:reset
```

- `dashboard:republish-history` republishes all local finalized runs into the current deployment
- `dashboard:reset` deploys a fresh registry and republishes local run history into it

## Deployment Direction

- target chain: Filecoin Calibration
- local dev server first
- later hosted as a static-style frontend on a Vercel or Netlify class platform
- dashboard pages are reconstructed from on-chain records; per-phase timing and published-artifact manifests are stored on chain, while full artifact contents remain off-chain and are linked by Filecoin-hosted retrieval URLs
