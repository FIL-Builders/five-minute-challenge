# Historical Run: 2026-03-04 Initial Manual Benchmark

This folder preserves the first successful manual Codex-driven execution against the Filecoin Cloud getting-started flow.

Why it matters:
- it proves the core Filecoin Cloud upload/download path succeeded at least once
- it provides concrete timings and example evidence artifacts
- it is useful as a design reference while the real benchmark harness is being built

Why it is not the final benchmark shape:
- the run was executed in the main working tree rather than a fresh temporary workspace
- the agent found a locally available private key in the environment
- the result format is informative but not yet the canonical schema for long-term monitoring

Contents:
- `report.md`
- `filecoin_quickstart.mjs`
- `artifacts/`
