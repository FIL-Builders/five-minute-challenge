import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { reconcileRunSummary } from "./lib/reconcile-run-summary.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    if (value === undefined) {
      throw new Error(`Missing value for ${key}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

async function maybeReadJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeMaybeString(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (isObject(value) && typeof value["/"] === "string") return value["/"];
  if (value && typeof value.toString === "function") {
    const normalized = value.toString();
    return typeof normalized === "string" && normalized.length > 0 ? normalized : null;
  }
  return null;
}

function normalizeAgentStatus(agentResult, agentExitCode, artifactValidationFailed) {
  if (artifactValidationFailed) return "invalid";
  if (typeof agentResult?.status === "string") {
    const normalized = agentResult.status.trim().toLowerCase();
    if (["success", "failure", "invalid"].includes(normalized)) return normalized;
    if (["blocked", "incomplete", "partial", "aborted", "error", "failed"].includes(normalized)) return "failure";
  }
  if (agentResult?.completed_end_to_end === false) return "failure";
  if (typeof agentResult?.success === "boolean") return agentResult.success ? "success" : "failure";
  return agentExitCode === 0 ? "success" : "failure";
}

function normalizeWalletAddress(agentResult) {
  if (typeof agentResult?.walletAddress === "string") return agentResult.walletAddress;
  if (typeof agentResult?.wallet?.address === "string") return agentResult.wallet.address;
  if (typeof agentResult?.inheritedWalletAddress === "string") return agentResult.inheritedWalletAddress;
  return null;
}

function normalizeAgentPhaseData(agentResult) {
  if (Array.isArray(agentResult?.agentPhaseData)) return agentResult.agentPhaseData;
  if (Array.isArray(agentResult?.phases)) {
    return agentResult.phases
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        phase: item.phase ?? item.name ?? "unknown",
        startedAt: item.startedAt ?? item.start,
        endedAt: item.endedAt ?? item.end,
        durationMs: Number(item.durationMs ?? item.duration_ms ?? 0)
      }));
  }
  if (Array.isArray(agentResult?.phase_durations)) {
    return agentResult.phase_durations
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        phase: item.phase ?? item.name ?? "unknown",
        startedAt: item.startedAt ?? item.start,
        endedAt: item.endedAt ?? item.end,
        durationMs: Number(item.durationMs ?? item.duration_ms ?? 0)
      }));
  }
  if (!Array.isArray(agentResult?.phaseTimings)) return [];
  return agentResult.phaseTimings
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      phase: item.phase ?? item.name ?? "unknown",
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      durationMs: Number(item.durationMs ?? 0)
    }));
}

function normalizeEvidence(agentResult) {
  const fundingTxHashes = Array.isArray(agentResult?.funding?.txHashes)
    ? agentResult.funding.txHashes.filter((value) => typeof value === "string" && value.length > 0)
    : [];
  const inheritedFundingSource = agentResult?.funding?.inheritedWalletPreFunded || agentResult?.funding?.wasPrefunded
    ? "inherited_wallet_prefunded"
    : (agentResult?.funding?.topUpPerformed ? (agentResult?.funding?.topUpMethod ?? "inherited_wallet_topped_up") : null);
  const depositRequirementSatisfied = Boolean(
    agentResult?.evidence?.depositRequirementSatisfied
      ?? agentResult?.funding?.depositApprovalTxHash
      ?? agentResult?.deposit?.txHash
      ?? agentResult?.payment?.depositAndApprovalTxHash
      ?? agentResult?.funding?.depositApprovalNeeded === false
      ?? agentResult?.funding?.depositApprovalAction === "not_needed"
  );

  return {
    fundingSource: agentResult?.evidence?.fundingSource ?? agentResult?.funding?.faucetUrl ?? inheritedFundingSource,
    fundingTxHash: agentResult?.evidence?.fundingTxHash ?? (fundingTxHashes.length > 0 ? fundingTxHashes.join(",") : null),
    depositTxHash: agentResult?.evidence?.depositTxHash ?? agentResult?.deposit?.txHash ?? agentResult?.payment?.depositAndApprovalTxHash ?? agentResult?.funding?.depositApprovalTxHash ?? null,
    depositRequirementSatisfied,
    pieceCid: normalizeMaybeString(
      agentResult?.evidence?.pieceCid
        ?? agentResult?.upload?.pieceCid
        ?? agentResult?.download?.pieceCid
        ?? agentResult?.storage?.upload?.pieceCid
        ?? agentResult?.storage?.download?.pieceCid
    ),
    contentMatch: Boolean(
      agentResult?.evidence?.contentMatch
        ?? agentResult?.download?.integrityOk
        ?? agentResult?.download?.integrityMatch
        ?? agentResult?.storage?.integrityVerified
    ),
    originalSha256: agentResult?.evidence?.originalSha256 ?? agentResult?.upload?.originalSha256 ?? agentResult?.upload?.payloadSha256 ?? agentResult?.payload?.sha256 ?? agentResult?.storage?.payloadSha256 ?? null,
    downloadedSha256: agentResult?.evidence?.downloadedSha256 ?? agentResult?.download?.downloadedSha256 ?? agentResult?.storage?.downloadedSha256 ?? null
  };
}

function normalizeArtifacts(runId, runDir, agentResult) {
  const rel = (name) => `runs/${runId}/${name}`;
  const reportPath = path.join(runDir, "report.md");
  const stdoutLogPath = path.join(runDir, "stdout.log");
  const stderrLogPath = path.join(runDir, "stderr.log");
  const agentLogFile = typeof agentResult?.artifacts?.agentLogPath === "string"
    ? path.basename(agentResult.artifacts.agentLogPath)
    : (typeof agentResult?.artifacts?.runLog === "string"
      ? path.basename(agentResult.artifacts.runLog)
      : (typeof agentResult?.artifacts?.benchmarkLogPath === "string"
        ? path.basename(agentResult.artifacts.benchmarkLogPath)
      : (Array.isArray(agentResult?.artifacts)
        ? path.basename(agentResult.artifacts.find((value) => typeof value === "string" && value.endsWith("execution.log")) ?? "agent.log")
        : "benchmark-run.log")));
  const uploadedPayloadFile = typeof agentResult?.artifacts?.uploadedPayloadPath === "string"
    ? path.basename(agentResult.artifacts.uploadedPayloadPath)
    : (typeof agentResult?.artifacts?.payloadFile === "string"
      ? path.basename(agentResult.artifacts.payloadFile)
      : (typeof agentResult?.artifacts?.payloadTextPath === "string"
        ? path.basename(agentResult.artifacts.payloadTextPath)
      : (typeof agentResult?.payload?.file === "string"
        ? path.basename(agentResult.payload.file)
        : (typeof agentResult?.upload?.payloadFile === "string"
          ? path.basename(agentResult.upload.payloadFile)
          : (typeof agentResult?.storage?.payloadFile === "string" ? path.basename(agentResult.storage.payloadFile) : "uploaded-payload.txt")))));
  const downloadedPayloadFile = typeof agentResult?.artifacts?.downloadedPayloadPath === "string"
    ? path.basename(agentResult.artifacts.downloadedPayloadPath)
    : (typeof agentResult?.artifacts?.downloadedTextFile === "string"
      ? path.basename(agentResult.artifacts.downloadedTextFile)
      : (typeof agentResult?.artifacts?.downloadedTextPath === "string"
        ? path.basename(agentResult.artifacts.downloadedTextPath)
      : (typeof agentResult?.artifacts?.downloadedFile === "string"
        ? path.basename(agentResult.artifacts.downloadedFile)
        : (typeof agentResult?.download?.downloadedFile === "string"
          ? path.basename(agentResult.download.downloadedFile)
          : (typeof agentResult?.storage?.downloadedFile === "string" ? path.basename(agentResult.storage.downloadedFile) : "downloaded-payload.txt")))));
  const agentLogPath = path.join(runDir, agentLogFile);
  const uploadedPayloadPath = path.join(runDir, uploadedPayloadFile);
  const downloadedPayloadPath = path.join(runDir, downloadedPayloadFile);
  const workspaceBundlePath = path.join(runDir, "workspace-output.tgz");

  return {
    reportPath: rel("report.md"),
    stdoutLogPath: rel("stdout.log"),
    stderrLogPath: rel("stderr.log"),
    agentLogPath: rel(agentLogFile),
    uploadedPayloadPath: rel(uploadedPayloadFile),
    downloadedPayloadPath: rel(downloadedPayloadFile),
    artifactBundleUri: agentResult?.artifacts?.artifactBundleUri ?? null,
    artifactBundleHash: agentResult?.artifacts?.artifactBundleHash ?? null,
    artifactBundleHttpUrl: agentResult?.artifacts?.artifactBundleHttpUrl ?? null,
    _localPaths: {
      reportPath,
      stdoutLogPath,
      stderrLogPath,
      agentLogPath,
      uploadedPayloadPath,
      downloadedPayloadPath,
      workspaceBundlePath
    }
  };
}

function collectWorkspaceArtifacts(agentResult) {
  const files = new Set(["report.md", "run-result.json"]);
  if (!agentResult || typeof agentResult !== "object") return [...files];

  const artifactEntries = isObject(agentResult.artifacts) ? Object.values(agentResult.artifacts) : [];
  for (const value of artifactEntries) {
    if (typeof value === "string" && value.length > 0 && !value.includes("/") && !value.includes("\\")) {
      files.add(value);
    }
  }

  if (Array.isArray(agentResult.artifacts)) {
    for (const value of agentResult.artifacts) {
      if (typeof value === "string" && value.length > 0) {
        files.add(path.basename(value));
      }
    }
  }

  for (const value of [
    agentResult?.upload?.payloadFile,
    agentResult?.download?.downloadedFile
  ]) {
    if (typeof value === "string" && value.length > 0) {
      files.add(path.basename(value));
    }
  }

    for (const name of ["agent.log", "run.log", "run-attempt1.log", "benchmark-run.log", "benchmark-run.mjs", "execution.log", "execution-attempt1.log", "run-benchmark.mjs"]) {
    files.add(name);
  }

  return [...files];
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"];
  const runDir = args["run-dir"];
  const workspace = args["workspace"];
  const runId = args["run-id"];
  const mode = args["mode"];
  const model = args["model"];
  const promptVersion = args["prompt-version"];
  const repoSha = args["repo-sha"];
  const docsUrl = args["docs-url"];
  const docsSnapshotHash = args["docs-snapshot-hash"] || null;
  const startedAt = args["started-at"];
  const endedAt = args["ended-at"];
  const startMs = Number(args["start-ms"]);
  const endMs = Number(args["end-ms"]);
  const outerWallTimeMs = Math.max(0, endMs - startMs);

  await mkdir(runDir, { recursive: true });
  const existingSummary = await maybeReadJson(path.join(runDir, "run-summary.json"));
  const existingPublishResult = await maybeReadJson(path.join(runDir, "artifact-publish-result.json"));

  const workspaceRunResultPath = path.join(workspace, "run-result.json");
  const runDirRunResultPath = path.join(runDir, "run-result.json");
  const workspaceHasRunResult = await exists(workspaceRunResultPath);
  const effectiveWorkspace = workspaceHasRunResult ? workspace : runDir;
  const agentResult = await maybeReadJson(workspaceHasRunResult ? workspaceRunResultPath : runDirRunResultPath);
  const parsedAgentExitCode = Number(args["agent-exit-code"]);
  const agentExitCode = Number.isInteger(parsedAgentExitCode)
    ? parsedAgentExitCode
    : (existingSummary?.agentExitCode ?? (agentResult?.success === true ? 0 : null));

  for (const name of collectWorkspaceArtifacts(agentResult)) {
    const source = path.join(effectiveWorkspace, name);
    const target = path.join(runDir, name);
    if ((await exists(source)) && !(await exists(target))) {
      await copyFile(source, target);
    }
  }

  const artifacts = normalizeArtifacts(runId, runDir, agentResult);

  const hasReport = await exists(path.join(runDir, "report.md"));
  const hasRunResult = await exists(path.join(runDir, "run-result.json"));
  const artifactValidationFailed = !hasReport || !hasRunResult;

  const result = {
    schemaVersion: "0.1.0",
    runId,
    mode,
    promptVersion,
    model,
    repoSha,
    docsUrl,
    docsSnapshotHash,
    startedAt,
    endedAt,
    outerWallTimeMs,
    status: normalizeAgentStatus(agentResult, agentExitCode, artifactValidationFailed),
    failurePhase: agentResult?.failurePhase ?? (artifactValidationFailed ? "artifact_validation" : null),
    agentExitCode,
    walletAddress: normalizeWalletAddress(agentResult),
    agentPhaseData: normalizeAgentPhaseData(agentResult),
    artifacts: {
      reportPath: artifacts.reportPath,
      stdoutLogPath: artifacts.stdoutLogPath,
      stderrLogPath: artifacts.stderrLogPath,
      agentLogPath: await exists(artifacts._localPaths.agentLogPath) ? artifacts.agentLogPath : null,
      uploadedPayloadPath: await exists(artifacts._localPaths.uploadedPayloadPath) ? artifacts.uploadedPayloadPath : null,
      downloadedPayloadPath: await exists(artifacts._localPaths.downloadedPayloadPath) ? artifacts.downloadedPayloadPath : null,
      artifactBundleUri: artifacts.artifactBundleUri ?? existingSummary?.artifacts?.artifactBundleUri ?? existingPublishResult?.artifactBundleUri ?? null,
      artifactBundleHash: artifacts.artifactBundleHash ?? existingSummary?.artifacts?.artifactBundleHash ?? existingPublishResult?.artifactBundleHash ?? null,
      artifactBundleHttpUrl: artifacts.artifactBundleHttpUrl ?? existingSummary?.artifacts?.artifactBundleHttpUrl ?? existingPublishResult?.artifactBundleHttpUrl ?? null
    },
    evidence: normalizeEvidence(agentResult),
    operatorNotes: artifactValidationFailed
      ? "Required benchmark artifacts were missing or unreadable."
      : agentResult?.operatorNotes ?? null
  };

  await writeFile(path.join(runDir, "run-summary.json"), `${JSON.stringify(result, null, 2)}\n`);

  const metadata = {
    runId,
    workspace,
    generatedAt: new Date().toISOString(),
    workspaceBundlePath: `runs/${runId}/workspace-output.tgz`,
    promptVersion,
    mode,
    docsUrl,
    docsSnapshotHash
  };
  await writeFile(path.join(runDir, "harness-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  if (agentResult && workspaceHasRunResult && !(await exists(path.join(runDir, "run-result.json")))) {
    await copyFile(workspaceRunResultPath, path.join(runDir, "run-result.json"));
  }

  const validator = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "validate-run.mjs"),
      "--run-dir",
      runDir,
      "--summary",
      path.join(runDir, "run-summary.json"),
      "--output",
      path.join(runDir, "validation-result.json")
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (validator.status !== 0) {
    throw new Error(validator.stderr || validator.stdout || "Run validation failed.");
  }

  await reconcileRunSummary({
    summaryPath: path.join(runDir, "run-summary.json"),
    validationPath: path.join(runDir, "validation-result.json"),
    baseOperatorNotes: result.operatorNotes
  });

  const dashboardRecords = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "build-dashboard-records.mjs"),
      "--run-dir",
      runDir,
      "--summary",
      path.join(runDir, "run-summary.json"),
      "--validation",
      path.join(runDir, "validation-result.json"),
      "--output",
      path.join(runDir, "dashboard-records.json")
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (dashboardRecords.status !== 0) {
    throw new Error(dashboardRecords.stderr || dashboardRecords.stdout || "Dashboard record generation failed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
