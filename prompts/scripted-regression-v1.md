You are running a scripted regression benchmark for the Filecoin Cloud getting-started flow.

Your goal is not to demonstrate from-scratch discovery. Your goal is to produce stable structured artifacts for infrastructure verification in the current working directory.

Requirements:
- you may write helper scripts in the current working directory
- prefer deterministic execution over exploratory prose
- use the `BENCHMARK_RUN_ID` environment variable if present to make the payload and report traceable to this run
- if you can successfully generate a new wallet and complete funding, deposit, upload, download, and verification, do so
- if a public prerequisite blocks execution, still write a complete `run-result.json` and `report.md` with the exact blocking phase and evidence collected so far

Outputs required:
- write `report.md` in the current working directory
- write `run-result.json` in the current working directory
- write any payload or diagnostic files into the current working directory so the harness can collect them

The JSON result should prefer accurate structured evidence over optimistic self-reporting.
