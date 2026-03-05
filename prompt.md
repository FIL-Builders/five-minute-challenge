You are running a benchmark of your ability to independently follow the Filecoin Cloud getting-started guide:
https://docs.filecoin.cloud/getting-started/

Your job is to act like a new external developer starting from scratch.

Requirements:
- do not rely on any pre-existing helper scripts or prior reports in the repo unless explicitly asked to preserve them as historical references
- generate a brand new private key and wallet during this run
- do not use a pre-provisioned private key discovered in environment variables
- fund the newly generated wallet by following the getting-started flow and any public guidance linked from it
- complete the end-to-end flow: funding, deposit/approval as needed, upload, download, and integrity verification
- make the uploaded payload unique to this run so the proof cannot be replayed from an earlier run

Outputs required:
- a Markdown report explaining what you did and whether the run succeeded
- a machine-readable JSON result file capturing the phases, timestamps, and concrete evidence
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
