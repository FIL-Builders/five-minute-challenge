import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Synapse, calibration, parseUnits } from "@filoz/synapse-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { reconcileRunSummary } from "./lib/reconcile-run-summary.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizePrivateKey(value) {
  if (!value) throw new Error("PRIVATE_KEY, ARTIFACT_PUBLISH_PRIVATE_KEY, or --private-key is required for artifact publishing.");
  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizePieceCid(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value["/"] === "string") return value["/"];
  if (typeof value?.toString === "function") return value.toString();
  return String(value);
}

function stringifyMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value?.toString === "function") {
    const result = value.toString();
    return typeof result === "string" && result.length > 0 ? result : null;
  }
  return null;
}

function normalizeCopies(copies) {
  if (!Array.isArray(copies)) return [];
  return copies.map((copy) => ({
    providerId: stringifyMaybe(copy?.providerId),
    pieceId: stringifyMaybe(copy?.pieceId),
    retrievalUrl: stringifyMaybe(copy?.retrievalUrl)
  }));
}

function normalizeFailures(failures) {
  if (!Array.isArray(failures)) return [];
  return failures.map((failure) => ({
    providerId: stringifyMaybe(failure?.providerId),
    pieceCid: stringifyMaybe(failure?.pieceCid),
    message: stringifyMaybe(failure?.message ?? failure?.error ?? failure)
  }));
}

function isFundsError(error) {
  const message = String(error?.message ?? error ?? "");
  return /InsufficientLockupFunds|Insufficient balance|InsufficientAvailableFunds|lockup/i.test(message);
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"];
  const runDir = args["run-dir"];
  const summaryPath = args["summary"] ?? path.join(runDir, "run-summary.json");
  const validationPath = args["validation"] ?? path.join(runDir, "validation-result.json");
  const bundlePath = args["bundle"] ?? path.join(runDir, "workspace-output.tgz");
  const privateKey = normalizePrivateKey(args["private-key"] ?? process.env.ARTIFACT_PUBLISH_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "");
  const depositAmount = args["deposit-amount"] ?? process.env.ARTIFACT_UPLOAD_DEPOSIT_AMOUNT ?? "0.5";

  const [summary, bundleBytes] = await Promise.all([readJson(summaryPath), readFile(bundlePath)]);
  const bundleHash = createHash("sha256").update(bundleBytes).digest("hex");

  const synapse = Synapse.create({
    account: privateKeyToAccount(privateKey),
    chain: calibration
  });

  let depositTxHash = null;
  let uploadResult = null;

  try {
    uploadResult = await synapse.storage.upload(bundleBytes);
  } catch (error) {
    if (!isFundsError(error)) throw error;
    const txHash = await synapse.payments.depositWithPermitAndApproveOperator({
      amount: parseUnits(depositAmount)
    });
    await synapse.client.waitForTransactionReceipt({ hash: txHash });
    depositTxHash = txHash;
    uploadResult = await synapse.storage.upload(bundleBytes);
  }

  const pieceCid = normalizePieceCid(uploadResult?.pieceCid);
  const copies = normalizeCopies(uploadResult?.copies);
  const failures = normalizeFailures(uploadResult?.failures);
  const artifactBundleHttpUrl = copies.find((copy) => typeof copy.retrievalUrl === "string" && /^https?:\/\//i.test(copy.retrievalUrl))?.retrievalUrl ?? null;
  const artifactBundleUri = `piececid:${pieceCid}`;
  const artifactBundleHash = `sha256:${bundleHash}`;

  summary.artifacts = {
    ...summary.artifacts,
    artifactBundleUri,
    artifactBundleHash,
    artifactBundleHttpUrl
  };
  summary.operatorNotes = `artifact_publish: uploaded workspace bundle to ${artifactBundleUri}`;

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  const publishResult = {
    publishedAt: new Date().toISOString(),
    runId: summary.runId,
    artifactBundleUri,
    artifactBundleHash,
    artifactBundleHttpUrl,
    pieceCid,
    depositTxHash,
    size: uploadResult?.size ?? bundleBytes.length,
    copyCount: copies.length,
    failureCount: failures.length,
    copies,
    failures
  };
  await writeFile(path.join(runDir, "artifact-publish-result.json"), `${JSON.stringify(publishResult, null, 2)}\n`);

  const { spawnSync } = await import("node:child_process");
  const revalidate = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "validate-run.mjs"),
      "--run-dir",
      runDir,
      "--summary",
      summaryPath,
      "--output",
      validationPath
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (revalidate.status !== 0) {
    throw new Error(revalidate.stderr || revalidate.stdout || "Failed to revalidate run after artifact upload.");
  }

  await reconcileRunSummary({
    summaryPath,
    validationPath,
    baseOperatorNotes: summary.operatorNotes
  });

  const rerender = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "build-dashboard-records.mjs"),
      "--run-dir",
      runDir,
      "--summary",
      summaryPath,
      "--validation",
      validationPath,
      "--output",
      path.join(runDir, "dashboard-records.json")
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (rerender.status !== 0) {
    throw new Error(rerender.stderr || rerender.stdout || "Failed to rebuild dashboard records after artifact upload.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
