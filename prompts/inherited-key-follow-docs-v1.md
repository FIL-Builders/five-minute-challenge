You are running a benchmark of your ability to follow the Filecoin Cloud getting-started guide with a pre-provisioned wallet:
https://docs.filecoin.cloud/getting-started/

Your job is to act like an external developer who has been given a wallet private key and now needs to complete the Filecoin Cloud flow.

Requirements:
- do not rely on any pre-existing helper scripts or prior reports in the repo unless explicitly asked to preserve them as historical references
- use the `PRIVATE_KEY` environment variable as the wallet for this run
- if `PRIVATE_KEY` is missing, fail clearly and record that as the primary reason
- do not generate a replacement wallet unless you need a disposable helper wallet for unrelated debugging; the benchmark wallet for this run must be the inherited key
- record whether the inherited wallet was already funded or required additional funding during the run
- if additional funding is required, use only the public getting-started flow and any public guidance linked from it
- do not use proxies, CAPTCHA-solving services, alternate IP relays, or any other technique intended to bypass spam protection, anti-bot controls, or rate limits
- if an official funding path is blocked by anti-abuse controls, treat that as benchmark evidence; record the block clearly and only continue with an alternative funding method if it is publicly documented or directly linked from the onboarding flow
- complete the end-to-end flow: deposit/approval as needed, upload, download, and integrity verification
- make the uploaded payload unique to this run so the proof cannot be replayed from an earlier run
- use the `BENCHMARK_RUN_ID` environment variable if present to make the payload and report traceable to this run

Outputs required:
- write `report.md` in the current working directory
- write `run-result.json` in the current working directory
- write any payload or diagnostic files into the current working directory so the harness can collect them
- logs and any helper code needed to understand or reproduce the run

In `run-result.json`, include a top-level `feedback` object with string fields:
- `whatWorkedWell`
- `frictionFailures`
- `recommendations`

Include in your report:
- the phases of execution and how long each one took
- the total end-to-end wall time
- the inherited wallet address used for the run
- whether the wallet was pre-funded or topped up during the run
- proof of deposit, upload, and download
- feedback on the SDK, docs, and any onboarding friction, prioritizing actionable suggestions for the development team
- explicit markdown sections titled exactly:
  - `## What Worked Well`
  - `## Friction / Failures`
  - `## Recommendations`

Important:
- the benchmark is about guide-following and service usage with inherited credentials, not secret discovery
- prefer structured evidence over narrative claims
- if you create helper scripts, keep them in the current working directory
- once `report.md` and `run-result.json` are written, stop work immediately and exit cleanly
