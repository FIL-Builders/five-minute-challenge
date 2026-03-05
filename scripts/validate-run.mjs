import { readFile, writeFile } from "node:fs/promises";
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

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isInteger(value) {
  return Number.isInteger(value);
}

function isDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function pushError(errors, pathName, message) {
  errors.push({ path: pathName, message });
}

function validateSchema(summary) {
  const errors = [];

  const requiredTopLevel = [
    "schemaVersion",
    "runId",
    "mode",
    "promptVersion",
    "model",
    "repoSha",
    "docsUrl",
    "startedAt",
    "endedAt",
    "outerWallTimeMs",
    "status",
    "artifacts",
    "evidence"
  ];

  if (!isObject(summary)) {
    pushError(errors, "$", "Run summary must be an object.");
    return errors;
  }

  for (const key of requiredTopLevel) {
    if (!(key in summary)) {
      pushError(errors, `$.${key}`, "Missing required property.");
    }
  }

  if (!isNonEmptyString(summary.schemaVersion)) pushError(errors, "$.schemaVersion", "Must be a non-empty string.");
  if (!isNonEmptyString(summary.runId)) pushError(errors, "$.runId", "Must be a non-empty string.");
  if (!["fresh-follow-docs", "inherited-key-follow-docs", "scripted-regression"].includes(summary.mode)) {
    pushError(errors, "$.mode", "Must be a supported benchmark mode.");
  }
  if (!isNonEmptyString(summary.promptVersion)) pushError(errors, "$.promptVersion", "Must be a non-empty string.");
  if (!isNonEmptyString(summary.model)) pushError(errors, "$.model", "Must be a non-empty string.");
  if (!isNonEmptyString(summary.repoSha)) pushError(errors, "$.repoSha", "Must be a non-empty string.");
  if (!isNonEmptyString(summary.docsUrl)) pushError(errors, "$.docsUrl", "Must be a non-empty string.");
  if (!(summary.docsSnapshotHash === null || isNonEmptyString(summary.docsSnapshotHash))) {
    pushError(errors, "$.docsSnapshotHash", "Must be null or a non-empty string.");
  }
  if (!isDateTime(summary.startedAt)) pushError(errors, "$.startedAt", "Must be a valid date-time string.");
  if (!isDateTime(summary.endedAt)) pushError(errors, "$.endedAt", "Must be a valid date-time string.");
  if (!isInteger(summary.outerWallTimeMs) || summary.outerWallTimeMs < 0) {
    pushError(errors, "$.outerWallTimeMs", "Must be an integer >= 0.");
  }
  if (!["success", "failure", "invalid"].includes(summary.status)) {
    pushError(errors, "$.status", "Must be success, failure, or invalid.");
  }

  const allowedFailurePhases = [
    null,
    "agent_boot",
    "wallet_generation",
    "funding",
    "deposit",
    "upload",
    "download",
    "verification",
    "artifact_validation"
  ];
  if (!allowedFailurePhases.includes(summary.failurePhase ?? null)) {
    pushError(errors, "$.failurePhase", "Must be null or a supported failure phase.");
  }
  if (!(summary.agentExitCode === null || isInteger(summary.agentExitCode))) {
    pushError(errors, "$.agentExitCode", "Must be null or an integer.");
  }
  if (!isNullableString(summary.walletAddress)) {
    pushError(errors, "$.walletAddress", "Must be null or a string.");
  }

  if (!Array.isArray(summary.agentPhaseData)) {
    pushError(errors, "$.agentPhaseData", "Must be an array.");
  } else {
    for (const [index, item] of summary.agentPhaseData.entries()) {
      if (!isObject(item)) {
        pushError(errors, `$.agentPhaseData[${index}]`, "Must be an object.");
        continue;
      }
      if (!isNonEmptyString(item.phase)) pushError(errors, `$.agentPhaseData[${index}].phase`, "Must be a non-empty string.");
      if (!isDateTime(item.startedAt)) pushError(errors, `$.agentPhaseData[${index}].startedAt`, "Must be a valid date-time string.");
      if (!isDateTime(item.endedAt)) pushError(errors, `$.agentPhaseData[${index}].endedAt`, "Must be a valid date-time string.");
      if (!isInteger(item.durationMs) || item.durationMs < 0) {
        pushError(errors, `$.agentPhaseData[${index}].durationMs`, "Must be an integer >= 0.");
      }
    }
  }

  if (!isObject(summary.artifacts)) {
    pushError(errors, "$.artifacts", "Must be an object.");
  } else {
    for (const required of ["reportPath", "stdoutLogPath", "stderrLogPath"]) {
      if (!isNonEmptyString(summary.artifacts[required])) {
        pushError(errors, `$.artifacts.${required}`, "Must be a non-empty string.");
      }
    }
    for (const optional of ["agentLogPath", "uploadedPayloadPath", "downloadedPayloadPath", "artifactBundleUri", "artifactBundleHash", "artifactBundleHttpUrl"]) {
      if (!(summary.artifacts[optional] === undefined || isNullableString(summary.artifacts[optional]))) {
        pushError(errors, `$.artifacts.${optional}`, "Must be null or a string.");
      }
    }
  }

  if (!isObject(summary.evidence)) {
    pushError(errors, "$.evidence", "Must be an object.");
  } else {
    for (const optional of ["fundingSource", "fundingTxHash", "depositTxHash", "pieceCid", "originalSha256", "downloadedSha256"]) {
      if (!(summary.evidence[optional] === undefined || isNullableString(summary.evidence[optional]))) {
        pushError(errors, `$.evidence.${optional}`, "Must be null or a string.");
      }
    }
    if (typeof summary.evidence.contentMatch !== "boolean") {
      pushError(errors, "$.evidence.contentMatch", "Must be a boolean.");
    }
  }

  if (!(summary.operatorNotes === undefined || isNullableString(summary.operatorNotes))) {
    pushError(errors, "$.operatorNotes", "Must be null or a string.");
  }

  return errors;
}

function evaluateRun(summary) {
  const findings = [];
  let status = "success";
  let failurePhase = null;

  const fail = (phase, message, nextStatus = "failure") => {
    findings.push({ severity: nextStatus === "invalid" ? "error" : "failure", phase, message });
    if (status !== "invalid") {
      status = nextStatus;
    }
    if (failurePhase === null) {
      failurePhase = phase;
    }
  };

  if (Number.isInteger(summary.agentExitCode) && summary.agentExitCode !== 0) {
    fail("agent_boot", `Agent exited with code ${summary.agentExitCode}.`);
  }

  if (!summary.walletAddress) {
    fail("wallet_generation", "Missing generated wallet address.");
  }

  const requiresFundingEvidence = summary.mode === "fresh-follow-docs";
  const requiresDepositEvidence = ["fresh-follow-docs", "inherited-key-follow-docs"].includes(summary.mode);

  if (requiresFundingEvidence && !summary.evidence?.fundingSource && !summary.evidence?.fundingTxHash) {
    fail("funding", "Missing funding evidence.");
  }

  if (requiresDepositEvidence && !summary.evidence?.depositTxHash) {
    fail("deposit", "Missing deposit or approval transaction evidence.");
  }

  if (!summary.evidence?.pieceCid) {
    fail("upload", "Missing uploaded piece CID.");
  }

  if (!summary.artifacts?.downloadedPayloadPath) {
    fail("download", "Missing downloaded payload artifact path.");
  }

  if (!summary.evidence?.contentMatch) {
    fail("verification", "Downloaded payload did not verify as matching uploaded content.");
  }

  return { status, failurePhase, findings };
}

async function main() {
  const args = parseArgs(process.argv);
  const runDir = args["run-dir"];
  const summaryPath = args["summary"] ?? path.join(runDir, "run-summary.json");
  const outputPath = args["output"] ?? path.join(runDir, "validation-result.json");

  const summary = await readJson(summaryPath);
  const schemaErrors = validateSchema(summary);

  let status = "invalid";
  let failurePhase = "artifact_validation";
  let findings = schemaErrors.map((error) => ({
    severity: "error",
    phase: "artifact_validation",
    message: `${error.path}: ${error.message}`
  }));

  if (schemaErrors.length === 0) {
    const evaluation = evaluateRun(summary);
    status = evaluation.status;
    failurePhase = evaluation.failurePhase;
    findings = evaluation.findings;
  }

  const result = {
    validatedAt: new Date().toISOString(),
    summaryPath: path.relative(process.cwd(), summaryPath),
    status,
    failurePhase,
    schemaValid: schemaErrors.length === 0,
    schemaErrors,
    findings
  };

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
