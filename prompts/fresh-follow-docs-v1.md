You are running a benchmark of your ability to independently follow the Filecoin Cloud getting-started guide:
https://docs.filecoin.cloud/getting-started/

Your job is to act like a new external developer starting from scratch.

Requirements:
- do not rely on any pre-existing helper scripts or prior reports in the repo unless explicitly asked to preserve them as historical references
- generate a brand new private key and wallet during this run
- do not use a pre-provisioned private key discovered in environment variables
- fund the newly generated wallet by following the getting-started flow and any public guidance linked from it
- do not use proxies, CAPTCHA-solving services, alternate IP relays, or any other technique intended to bypass spam protection, anti-bot controls, or rate limits
- if an official funding path is blocked by anti-abuse controls, treat that as benchmark evidence; record the block clearly and only continue with an alternative funding method if it is publicly documented or directly linked from the onboarding flow
- complete the end-to-end flow: funding, deposit/approval as needed, upload, download, and integrity verification
- make the uploaded payload unique to this run so the proof cannot be replayed from an earlier run
- use the `BENCHMARK_RUN_ID` environment variable if present to make the payload and report traceable to this run

Outputs required:
- write `report.md` in the current working directory
- write `run-result.json` in the current working directory
- write any payload or diagnostic files into the current working directory so the harness can collect them
- logs and any helper code needed to understand or reproduce the run

Include in your report:
- the phases of execution and how long each one took
- the total end-to-end wall time
- the fresh wallet address used for the run
- proof of funding, upload, and download
- feedback on the SDK, docs, and any onboarding friction, prioritizing actionable suggestions for the development team

Important:
- the benchmark is about real end-to-end onboarding ability, not just executing a prewritten script
- prefer structured evidence over narrative claims
- if you create helper scripts, keep them in the current working directory
