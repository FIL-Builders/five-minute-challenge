# Filecoin Cloud Getting Started Execution Report

Date: 2026-03-04 (UTC)
Guide followed: https://docs.filecoin.cloud/getting-started/
Network: Filecoin Calibration
Workspace: `/home/mikers/dev/fil-builders/five-minute-challenge`

## Summary
I executed the Getting Started flow with the Synapse SDK and successfully:
- funded the wallet for calibration usage,
- deposited and approved USDFC for warm storage,
- uploaded a file,
- downloaded the file by `pieceCid`,
- verified byte-level integrity (SHA-256 match).

## End-to-End Phases and Timings (Successful Run)
Source of truth: `artifacts/filecoin_quickstart_result.json`

| Phase | Start (UTC) | End (UTC) | Duration |
|---|---|---|---:|
| `sdk_init` | 2026-03-04T18:24:27.349Z | 2026-03-04T18:24:27.383Z | 34 ms |
| `wallet_balance_check` | 2026-03-04T18:24:27.383Z | 2026-03-04T18:24:28.078Z | 695 ms |
| `deposit_and_approve` | 2026-03-04T18:24:28.078Z | 2026-03-04T18:25:31.252Z | 63,174 ms |
| `upload` | 2026-03-04T18:25:31.252Z | 2026-03-04T18:27:32.157Z | 120,905 ms |
| `download_and_verify` | 2026-03-04T18:27:32.157Z | 2026-03-04T18:27:32.588Z | 431 ms |

Total wall time (SDK flow): **185,239 ms** (**3m 05.239s**)
CLI-measured real time: **186.74s** (`/usr/bin/time -p`)

## Proof of Successful Upload + Download
- Deposit/approval tx hash:
  - `0xbd56a2a98418bab7b91030c8b32093e310aadf1b19aa95574119d82de0bd0249`
- Upload result:
  - `pieceCid`: `bafkzcibcdibzuzoft3vsfqobrhalogydjiny3k7y4nubip6xtucr27bykupf2ba`
  - `size`: `228` bytes
  - `copyCount`: `2`
  - `failureCount`: `0`
- Download verification:
  - `downloadedBytes`: `228`
  - `originalSha256`: `08a44d8b17755bde450b3f4274b30bf3862ad2a3038550a7acde95612399a9d4`
  - `downloadedSha256`: `08a44d8b17755bde450b3f4274b30bf3862ad2a3038550a7acde95612399a9d4`
  - `contentMatch`: `true`

## Artifacts
- Full result JSON: `artifacts/filecoin_quickstart_result.json`
- Runtime log: `artifacts/filecoin_quickstart_run.log`
- Run timestamps: `artifacts/run_meta.txt`
- Uploaded payload: `artifacts/uploaded_payload.txt`
- Downloaded payload: `artifacts/downloaded_payload.txt`
- Script used: `filecoin_quickstart.mjs`

## Notes on Prerequisites and Setup Friction
Before the successful run, execution was blocked because wallet USDFC balance was `0`.
I resolved this with the calibration claim API:
- `https://forest-explorer.chainsafe.dev/api/claim_token_all?address=<wallet>`
- Returned tx hashes that were initially not yet mined, then confirmed a short time later.

## SDK + Documentation Feedback

### What worked well
1. **High-level SDK flow is concise**: `Synapse.create()`, `depositWithPermitAndApproveOperator()`, `storage.upload()`, and `storage.download()` made the core workflow straightforward.
2. **Error details are useful**: errors included actionable details like `Insufficient balance` and `InsufficientLockupFunds(...)` with required/available amounts.
3. **Data integrity verification succeeded cleanly**: download-by-piece CID worked and matched the uploaded bytes exactly.

### What did not work well (actionable)
1. **Faucet guidance is UI-only in the quickstart path**:
   - The linked faucet routes are bot-protected and not automation-friendly.
   - Suggestion: document the calibration API endpoint (`/api/claim_token_all`) as an official CLI option and note rate limits.
2. **No explicit guidance on faucet settlement delay**:
   - Claim API returned tx hashes before balances were visible; initial runs failed due zero balance.
   - Suggestion: add a “wait for faucet tx confirmation + verify balance” step in the guide.
3. **Upload phase is relatively long with limited default visibility**:
   - Upload+commit took ~121s in this run.
   - Suggestion: highlight progress callback usage in the main quickstart snippet so users can see provider/commit progress.
4. **PieceCID output shape is object-like (`{"/": ...}`)**:
   - This can be surprising for downstream logging/parsing.
   - Suggestion: normalize examples to always print a plain string representation (`pieceCid.toString()`).

## Conclusion
The getting-started flow was executed successfully on calibration, including upload and download verification, with reproducible evidence and timing artifacts captured in this repository.
