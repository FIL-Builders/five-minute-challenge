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

Run a local preview against Calibration:

```bash
DASHBOARD_PRIVATE_KEY=0x... ./bin/dev-dashboard.sh
```

Defaults:
- host: `127.0.0.1`
- port: `3001`
- chain: `filecoin_calibration`

## Deployment Direction

- target chain: Filecoin Calibration
- local dev server first
- later hosted as a static-style frontend on a Vercel or Netlify class platform
- full logs remain off-chain; the app stores compact summaries and artifact bundle references
