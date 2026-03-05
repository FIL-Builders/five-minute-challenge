import { Synapse, parseUnits, calibration, TOKENS, formatUnits } from "@filoz/synapse-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const phaseData = [];
let phaseStart = Date.now();

function beginPhase(name) {
  phaseStart = Date.now();
  return { name, startedAt: new Date(phaseStart).toISOString() };
}

function endPhase(phase, extra = {}) {
  const end = Date.now();
  phaseData.push({
    phase: phase.name,
    startedAt: phase.startedAt,
    endedAt: new Date(end).toISOString(),
    durationMs: end - Date.parse(phase.startedAt),
    ...extra,
  });
}

async function main() {
  const overallStart = Date.now();
  const artifactsDir = new URL("./artifacts/", import.meta.url);
  await mkdir(artifactsDir, { recursive: true });

  const privateKeyRaw = process.env.PRIVATE_KEY;
  if (!privateKeyRaw) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  const privateKey = privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`;

  const pInit = beginPhase("sdk_init");
  const synapse = Synapse.create({
    account: privateKeyToAccount(privateKey),
    chain: calibration,
  });
  endPhase(pInit);

  const pBalance = beginPhase("wallet_balance_check");
  const walletBalance = await synapse.payments.walletBalance({ token: TOKENS.USDFC });
  const walletBalanceUsdfc = formatUnits(walletBalance);
  endPhase(pBalance, { walletBalanceUsdfc });

  const pDeposit = beginPhase("deposit_and_approve");
  const txHash = await synapse.payments.depositWithPermitAndApproveOperator({
    amount: parseUnits("2.5"),
  });
  const receipt = await synapse.client.waitForTransactionReceipt({ hash: txHash });
  endPhase(pDeposit, {
    txHash,
    blockNumber: receipt.blockNumber?.toString?.() ?? null,
    status: receipt.status,
    gasUsed: receipt.gasUsed?.toString?.() ?? null,
  });

  const pUpload = beginPhase("upload");
  const uploadPayloadText = `Filecoin Cloud quickstart verification run at ${new Date().toISOString()}\n` +
    "This payload is intentionally above 127 bytes to satisfy minimum upload requirements.\n" +
    "If you can read this after download, the end-to-end workflow succeeded.";
  const fileBytes = new TextEncoder().encode(uploadPayloadText);
  const uploadResult = await synapse.storage.upload(fileBytes);
  endPhase(pUpload, {
    pieceCid: uploadResult.pieceCid,
    size: uploadResult.size,
    copyCount: uploadResult.copies.length,
    failureCount: uploadResult.failures.length,
  });

  const pDownload = beginPhase("download_and_verify");
  const downloadedBytes = await synapse.storage.download({ pieceCid: uploadResult.pieceCid });
  const downloadedText = new TextDecoder().decode(downloadedBytes);
  const originalSha256 = createHash("sha256").update(fileBytes).digest("hex");
  const downloadedSha256 = createHash("sha256").update(downloadedBytes).digest("hex");
  const contentMatch = downloadedText === uploadPayloadText && originalSha256 === downloadedSha256;
  endPhase(pDownload, {
    downloadedBytes: downloadedBytes.length,
    originalSha256,
    downloadedSha256,
    contentMatch,
  });

  const overallEnd = Date.now();
  const result = {
    startedAt: new Date(overallStart).toISOString(),
    endedAt: new Date(overallEnd).toISOString(),
    totalWallTimeMs: overallEnd - overallStart,
    network: "filecoin_calibration",
    phaseData,
    evidence: {
      txHash,
      pieceCid: uploadResult.pieceCid,
      uploadSizeBytes: uploadResult.size,
      uploadedCopyCount: uploadResult.copies.length,
      uploadFailureCount: uploadResult.failures.length,
      contentMatch,
      walletBalanceUsdfc,
    },
  };

  await writeFile(new URL("./artifacts/filecoin_quickstart_result.json", import.meta.url), JSON.stringify(result, null, 2));
  await writeFile(new URL("./artifacts/uploaded_payload.txt", import.meta.url), uploadPayloadText);
  await writeFile(new URL("./artifacts/downloaded_payload.txt", import.meta.url), downloadedText);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Quickstart execution failed:", error?.message || error);
  if (error?.cause) {
    console.error("Cause:", error.cause);
  }
  process.exit(1);
});
