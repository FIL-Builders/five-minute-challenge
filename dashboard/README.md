# Benchmark Registry Dashboard

This directory defines the Token Host Builder app for benchmark history and operator inspection.

## Files

- `schema.json`: canonical THS schema for the run registry app

## Current Scope

The app currently models:
- `BenchmarkRun`: one row per validated benchmark run
- `BenchmarkIncident`: operator-tracked incidents tied to runs
- `BenchmarkConfig`: lightweight benchmark configuration records

## Local Workflow

Generate the app scaffold:

```bash
./bin/generate-dashboard.sh
```

That writes generated output under `dashboard/generated/`.

Build a local aggregate feed from benchmark runs:

```bash
npm run dashboard:feed
```

That writes `dashboard/local-feed.json` from any `runs/*/dashboard-records.json` files present locally.

Run the local dashboard UI against the current local feed:

```bash
npm run dashboard:dev
```

Defaults:
- host: `127.0.0.1`
- port: `3001`

This serves the already-generated Next UI from `dashboard/generated/ui` and rebuilds `dashboard/local-feed.json` before startup.

If you want to compile/deploy the Token Host Builder app schema against Calibration instead, run:

```bash
PRIVATE_KEY=0x... npm run dashboard:up
```

Defaults for schema deployment:
- host: `127.0.0.1`
- port: `3001`
- chain: `filecoin_calibration`
- wallet env: `PRIVATE_KEY` by default, or `DASHBOARD_PRIVATE_KEY` to override

## Deployment Direction

- target chain: Filecoin Calibration
- local dev server first
- later hosted as a static-style frontend on a Vercel or Netlify class platform
- full logs remain off-chain; the app stores compact summaries and artifact bundle references
