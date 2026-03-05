import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

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

function normalizeArtifacts(runId, runDir, agentResult) {
  const rel = (name) => `runs/${runId}/${name}`;
  const reportPath = path.join(runDir, "report.md");
  const stdoutLogPath = path.join(runDir, "stdout.log");
  const stderrLogPath = path.join(runDir, "stderr.log");
  const agentLogPath = path.join(runDir, "agent.log");
  const uploadedPayloadPath = path.join(runDir, "uploaded-payload.txt");
  const downloadedPayloadPath = path.join(runDir, "downloaded-payload.txt");
  const workspaceBundlePath = path.join(runDir, "workspace-output.tgz");

  return {
    reportPath: rel("report.md"),
    stdoutLogPath: rel("stdout.log"),
    stderrLogPath: rel("stderr.log"),
    agentLogPath: agentResult?.artifacts?.agentLogPath ?? rel("agent.log"),
    uploadedPayloadPath: agentResult?.artifacts?.uploadedPayloadPath ?? rel("uploaded-payload.txt"),
    downloadedPayloadPath: agentResult?.artifacts?.downloadedPayloadPath ?? rel("downloaded-payload.txt"),
    artifactBundleUri: agentResult?.artifacts?.artifactBundleUri ?? null,
    artifactBundleHash: agentResult?.artifacts?.artifactBundleHash ?? null,
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
  const startedAt = args["started-at"];
  const endedAt = args["ended-at"];
  const startMs = Number(args["start-ms"]);
  const endMs = Number(args["end-ms"]);
  const agentExitCode = Number(args["agent-exit-code"]);
  const outerWallTimeMs = Math.max(0, endMs - startMs);

  await mkdir(runDir, { recursive: true });

  for (const name of ["report.md", "run-result.json", "agent.log", "uploaded-payload.txt", "downloaded-payload.txt"]) {
    const source = path.join(workspace, name);
    const target = path.join(runDir, name);
    if ((await exists(source)) && !(await exists(target))) {
      await copyFile(source, target);
    }
  }

  const agentResult = await maybeReadJson(path.join(workspace, "run-result.json"));
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
    docsSnapshotHash: null,
    startedAt,
    endedAt,
    outerWallTimeMs,
    status: artifactValidationFailed ? "invalid" : (agentResult?.status ?? (agentExitCode === 0 ? "success" : "failure")),
    failurePhase: agentResult?.failurePhase ?? (artifactValidationFailed ? "artifact_validation" : null),
    agentExitCode,
    walletAddress: agentResult?.walletAddress ?? null,
    agentPhaseData: Array.isArray(agentResult?.agentPhaseData) ? agentResult.agentPhaseData : [],
    artifacts: {
      reportPath: artifacts.reportPath,
      stdoutLogPath: artifacts.stdoutLogPath,
      stderrLogPath: artifacts.stderrLogPath,
      agentLogPath: await exists(artifacts._localPaths.agentLogPath) ? `runs/${runId}/agent.log` : null,
      uploadedPayloadPath: await exists(artifacts._localPaths.uploadedPayloadPath) ? `runs/${runId}/uploaded-payload.txt` : null,
      downloadedPayloadPath: await exists(artifacts._localPaths.downloadedPayloadPath) ? `runs/${runId}/downloaded-payload.txt` : null,
      artifactBundleUri: artifacts.artifactBundleUri,
      artifactBundleHash: artifacts.artifactBundleHash
    },
    evidence: {
      fundingSource: agentResult?.evidence?.fundingSource ?? null,
      fundingTxHash: agentResult?.evidence?.fundingTxHash ?? null,
      depositTxHash: agentResult?.evidence?.depositTxHash ?? null,
      pieceCid: agentResult?.evidence?.pieceCid ?? null,
      contentMatch: Boolean(agentResult?.evidence?.contentMatch),
      originalSha256: agentResult?.evidence?.originalSha256 ?? null,
      downloadedSha256: agentResult?.evidence?.downloadedSha256 ?? null
    },
    operatorNotes: artifactValidationFailed
      ? "Required benchmark artifacts were missing or unreadable."
      : agentResult?.operatorNotes ?? null
  };

  await writeFile(path.join(runDir, "run-summary.json"), `${JSON.stringify(result, null, 2)}\n`);

  const metadata = {
    runId,
    workspace,
    generatedAt: new Date().toISOString(),
    workspaceBundlePath: `runs/${runId}/workspace-output.tgz`
  };
  await writeFile(path.join(runDir, "harness-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  const workspaceRunResult = path.join(workspace, "run-result.json");
  if (agentResult && !(await exists(path.join(runDir, "run-result.json")))) {
    await copyFile(workspaceRunResult, path.join(runDir, "run-result.json"));
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

  const validation = await maybeReadJson(path.join(runDir, "validation-result.json"));
  if (validation && typeof validation === "object") {
    result.status = validation.status ?? result.status;
    result.failurePhase = validation.failurePhase ?? result.failurePhase;
    if (Array.isArray(validation.findings) && validation.findings.length > 0) {
      const rendered = validation.findings
        .map((finding) => `${finding.phase}: ${finding.message}`)
        .join(" | ");
      result.operatorNotes = result.operatorNotes ? `${result.operatorNotes} ${rendered}` : rendered;
    }
    await writeFile(path.join(runDir, "run-summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
