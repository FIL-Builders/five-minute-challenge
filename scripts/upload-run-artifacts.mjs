import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeUploadOutcome(uploadResult, bytes, hashHex) {
  const pieceCid = normalizePieceCid(uploadResult?.pieceCid);
  const copies = normalizeCopies(uploadResult?.copies);
  const failures = normalizeFailures(uploadResult?.failures);
  const httpUrl = copies.find((copy) => typeof copy.retrievalUrl === "string" && /^https?:\/\//i.test(copy.retrievalUrl))?.retrievalUrl ?? null;
  const size = Number(uploadResult?.size ?? bytes.length);

  return {
    pieceCid,
    uri: `piececid:${pieceCid}`,
    hash: `sha256:${hashHex}`,
    httpUrl,
    size,
    copyCount: copies.length,
    failureCount: failures.length,
    copies,
    failures
  };
}

async function uploadBytesWithRetry({ synapse, bytes, depositAmount, uploadState }) {
  try {
    return await synapse.storage.upload(bytes);
  } catch (error) {
    if (!isFundsError(error)) throw error;
    const txHash = await synapse.payments.depositWithPermitAndApproveOperator({
      amount: parseUnits(depositAmount)
    });
    await synapse.client.waitForTransactionReceipt({ hash: txHash });
    uploadState.depositTxHashes.push(txHash);
    return await synapse.storage.upload(bytes);
  }
}

function runNodeScript(repoRoot, scriptPath, args, errorMessage) {
  const child = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (child.status !== 0) {
    throw new Error(child.stderr || child.stdout || errorMessage);
  }
}

async function revalidateAndRefresh({ repoRoot, runDir, summaryPath, validationPath, baseOperatorNotes }) {
  runNodeScript(
    repoRoot,
    path.join(repoRoot, "scripts", "validate-run.mjs"),
    ["--run-dir", runDir, "--summary", summaryPath, "--output", validationPath],
    "Failed to revalidate run after artifact upload."
  );

  await reconcileRunSummary({
    summaryPath,
    validationPath,
    baseOperatorNotes
  });

  runNodeScript(
    repoRoot,
    path.join(repoRoot, "scripts", "build-dashboard-records.mjs"),
    [
      "--run-dir",
      runDir,
      "--summary",
      summaryPath,
      "--validation",
      validationPath,
      "--output",
      path.join(runDir, "dashboard-records.json")
    ],
    "Failed to rebuild dashboard records after artifact upload."
  );
}

function artifactCandidate(label, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return null;
  return { label, relativePath };
}

function uniqueByPath(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry.relativePath)) continue;
    seen.add(entry.relativePath);
    output.push(entry);
  }
  return output;
}

function collectArtifactCandidates(summary) {
  const runId = summary.runId;
  return uniqueByPath([
    artifactCandidate("Report", summary.artifacts?.reportPath),
    artifactCandidate("Stdout log", summary.artifacts?.stdoutLogPath),
    artifactCandidate("Stderr log", summary.artifacts?.stderrLogPath),
    artifactCandidate("Agent log", summary.artifacts?.agentLogPath),
    artifactCandidate("Uploaded payload", summary.artifacts?.uploadedPayloadPath),
    artifactCandidate("Downloaded payload", summary.artifacts?.downloadedPayloadPath),
    artifactCandidate("Agent result", `runs/${runId}/run-result.json`),
    artifactCandidate("Validation result", `runs/${runId}/validation-result.json`),
    artifactCandidate("Docs snapshot", `runs/${runId}/docs-snapshot.html`)
  ]);
}

async function publishArtifactFile({ repoRoot, synapse, uploadState, depositAmount, label, relativePath }) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!(await fileExists(absolutePath))) return null;

  const bytes = await readFile(absolutePath);
  const hashHex = sha256Hex(bytes);
  const uploadResult = await uploadBytesWithRetry({
    synapse,
    bytes,
    depositAmount,
    uploadState
  });

  const normalized = normalizeUploadOutcome(uploadResult, bytes, hashHex);
  return {
    label,
    path: relativePath,
    ...normalized
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"] ?? process.cwd();
  const runDir = args["run-dir"];
  const summaryPath = args["summary"] ?? path.join(runDir, "run-summary.json");
  const validationPath = args["validation"] ?? path.join(runDir, "validation-result.json");
  const bundlePath = args["bundle"] ?? path.join(runDir, "workspace-output.tgz");
  const privateKey = normalizePrivateKey(args["private-key"] ?? process.env.ARTIFACT_PUBLISH_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "");
  const depositAmount = args["deposit-amount"] ?? process.env.ARTIFACT_UPLOAD_DEPOSIT_AMOUNT ?? "0.5";

  if (!runDir) throw new Error("--run-dir is required.");

  let summary = await readJson(summaryPath);
  const bundleBytes = await readFile(bundlePath);
  const uploadState = { depositTxHashes: [] };

  const synapse = Synapse.create({
    account: privateKeyToAccount(privateKey),
    chain: calibration
  });

  const bundleHashHex = sha256Hex(bundleBytes);
  const bundleUpload = normalizeUploadOutcome(
    await uploadBytesWithRetry({
      synapse,
      bytes: bundleBytes,
      depositAmount,
      uploadState
    }),
    bundleBytes,
    bundleHashHex
  );

  summary.artifacts = {
    ...summary.artifacts,
    artifactBundleUri: bundleUpload.uri,
    artifactBundleHash: bundleUpload.hash,
    artifactBundleHttpUrl: bundleUpload.httpUrl
  };
  summary.operatorNotes = `artifact_publish: uploaded workspace bundle to ${bundleUpload.uri}`;
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  await revalidateAndRefresh({
    repoRoot,
    runDir,
    summaryPath,
    validationPath,
    baseOperatorNotes: summary.operatorNotes
  });

  summary = await readJson(summaryPath);
  const publishedArtifacts = [];
  for (const candidate of collectArtifactCandidates(summary)) {
    const published = await publishArtifactFile({
      repoRoot,
      synapse,
      uploadState,
      depositAmount,
      label: candidate.label,
      relativePath: candidate.relativePath
    });
    if (published) publishedArtifacts.push(published);
  }

  const artifactIndexPayload = {
    runId: summary.runId,
    generatedAt: new Date().toISOString(),
    artifactBundle: {
      uri: bundleUpload.uri,
      hash: bundleUpload.hash,
      httpUrl: bundleUpload.httpUrl,
      pieceCid: bundleUpload.pieceCid,
      size: bundleUpload.size
    },
    publishedArtifacts: publishedArtifacts.map((artifact) => ({
      label: artifact.label,
      path: artifact.path,
      uri: artifact.uri,
      hash: artifact.hash,
      httpUrl: artifact.httpUrl,
      pieceCid: artifact.pieceCid,
      size: artifact.size
    }))
  };
  const artifactIndexBytes = Buffer.from(`${JSON.stringify(artifactIndexPayload, null, 2)}\n`);
  const artifactIndexHashHex = sha256Hex(artifactIndexBytes);
  const artifactIndexUpload = normalizeUploadOutcome(
    await uploadBytesWithRetry({
      synapse,
      bytes: artifactIndexBytes,
      depositAmount,
      uploadState
    }),
    artifactIndexBytes,
    artifactIndexHashHex
  );

  summary = await readJson(summaryPath);
  summary.artifacts = {
    ...summary.artifacts,
    artifactBundleUri: bundleUpload.uri,
    artifactBundleHash: bundleUpload.hash,
    artifactBundleHttpUrl: bundleUpload.httpUrl,
    artifactIndexUri: artifactIndexUpload.uri,
    artifactIndexHash: artifactIndexUpload.hash,
    artifactIndexHttpUrl: artifactIndexUpload.httpUrl
  };
  summary.operatorNotes = `artifact_publish: uploaded workspace bundle to ${bundleUpload.uri} and artifact index to ${artifactIndexUpload.uri}`;
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  await revalidateAndRefresh({
    repoRoot,
    runDir,
    summaryPath,
    validationPath,
    baseOperatorNotes: summary.operatorNotes
  });

  const publishResult = {
    publishedAt: new Date().toISOString(),
    runId: summary.runId,
    depositTxHashes: uploadState.depositTxHashes,
    artifactBundle: bundleUpload,
    artifactIndex: artifactIndexUpload,
    publishedArtifacts
  };
  await writeFile(path.join(runDir, "artifact-publish-result.json"), `${JSON.stringify(publishResult, null, 2)}\n`);

  runNodeScript(
    repoRoot,
    path.join(repoRoot, "scripts", "build-dashboard-records.mjs"),
    [
      "--run-dir",
      runDir,
      "--summary",
      summaryPath,
      "--validation",
      validationPath,
      "--output",
      path.join(runDir, "dashboard-records.json")
    ],
    "Failed to rebuild dashboard records after artifact publishing."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
