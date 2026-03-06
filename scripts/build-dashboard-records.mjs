import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

async function maybeReadJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeNotes(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildArtifactEntry(label, relativePath, url, extra = {}) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return null;
  if (typeof url !== "string" || !url.trim()) return null;
  return {
    label,
    path: relativePath,
    url,
    ...extra
  };
}

function buildPublishedArtifacts(summary, artifactPublishResult) {
  const entries = Array.isArray(artifactPublishResult?.publishedArtifacts)
    ? artifactPublishResult.publishedArtifacts
    : [];

  const publishedArtifacts = entries
    .map((entry) =>
      buildArtifactEntry(entry.label, entry.path, entry.httpUrl, {
        uri: entry.uri ?? null,
        hash: entry.hash ?? null,
        pieceCid: entry.pieceCid ?? null
      }))
    .filter(Boolean);

  if (summary.artifacts?.artifactIndexHttpUrl) {
    publishedArtifacts.unshift(
      buildArtifactEntry("Artifact index", `runs/${summary.runId}/artifact-index.json`, summary.artifacts.artifactIndexHttpUrl, {
        uri: summary.artifacts?.artifactIndexUri ?? null,
        hash: summary.artifacts?.artifactIndexHash ?? null,
        pieceCid: artifactPublishResult?.artifactIndex?.pieceCid ?? null
      })
    );
  }

  if (summary.artifacts?.artifactBundleHttpUrl) {
    publishedArtifacts.push(
      buildArtifactEntry("Artifact bundle", `runs/${summary.runId}/workspace-output.tgz`, summary.artifacts.artifactBundleHttpUrl, {
        uri: summary.artifacts?.artifactBundleUri ?? null,
        hash: summary.artifacts?.artifactBundleHash ?? null,
        pieceCid: artifactPublishResult?.artifactBundle?.pieceCid ?? null
      })
    );
  }

  return publishedArtifacts.filter(Boolean);
}

function buildRunRecord(summary, validation, artifactPublishResult, publishResult, outputPath) {
  const runId = summary.runId;
  const publishedArtifacts = buildPublishedArtifacts(summary, artifactPublishResult);

  return {
    collection: "BenchmarkRun",
    data: {
      runId,
      mode: summary.mode,
      promptVersion: summary.promptVersion,
      model: summary.model,
      repoSha: summary.repoSha,
      docsUrl: summary.docsUrl,
      docsSnapshotHash: summary.docsSnapshotHash ?? "",
      status: summary.status,
      failurePhase: summary.failurePhase ?? "",
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      outerWallTimeMs: String(summary.outerWallTimeMs),
      walletAddress: summary.walletAddress ?? "0x0000000000000000000000000000000000000000",
      fundingTxHash: summary.evidence?.fundingTxHash ?? "",
      depositTxHash: summary.evidence?.depositTxHash ?? "",
      pieceCid: summary.evidence?.pieceCid ?? "",
      contentMatch: Boolean(summary.evidence?.contentMatch),
      artifactBundleUri: summary.artifacts?.artifactBundleUri ?? "",
      artifactBundleHash: summary.artifacts?.artifactBundleHash ?? "",
      artifactBundleHttpUrl: summary.artifacts?.artifactBundleHttpUrl ?? "",
      artifactIndexUri: summary.artifacts?.artifactIndexUri ?? "",
      artifactIndexHash: summary.artifacts?.artifactIndexHash ?? "",
      artifactIndexHttpUrl: summary.artifacts?.artifactIndexHttpUrl ?? "",
      operatorNotes: normalizeNotes(summary.operatorNotes) ?? ""
    },
    meta: {
      source: {
        runSummaryPath: `runs/${runId}/run-summary.json`,
        validationResultPath: `runs/${runId}/validation-result.json`,
        dashboardRecordsPath: `runs/${runId}/${path.basename(outputPath)}`,
        artifactPublishResultPath: artifactPublishResult ? `runs/${runId}/artifact-publish-result.json` : null,
        dashboardPublishResultPath: publishResult ? `runs/${runId}/dashboard-publish-result.json` : null
      },
      publishedArtifacts,
      validation: {
        status: validation?.status ?? null,
        failurePhase: validation?.failurePhase ?? null,
        schemaValid: validation?.schemaValid ?? null
      },
      externalArtifacts: {
        artifactBundleUri: summary.artifacts?.artifactBundleUri ?? null,
        artifactBundleHash: summary.artifacts?.artifactBundleHash ?? null,
        artifactBundleHttpUrl: summary.artifacts?.artifactBundleHttpUrl ?? null,
        artifactIndexUri: summary.artifacts?.artifactIndexUri ?? null,
        artifactIndexHash: summary.artifacts?.artifactIndexHash ?? null,
        artifactIndexHttpUrl: summary.artifacts?.artifactIndexHttpUrl ?? null
      },
      dashboardPublish: publishResult
        ? {
            status: publishResult.status ?? "success",
            attemptedAt: publishResult.attemptedAt ?? null,
            publishedAt: publishResult.publishedAt ?? null,
            chainName: publishResult.chainName ?? null,
            deploymentAddress: publishResult.deploymentAddress ?? null,
            runRecordId: publishResult.runRecordId ?? null,
            runRecordHref: publishResult.runRecordHref ?? null,
            incidentRecordIds: Array.isArray(publishResult.incidentRecordIds) ? publishResult.incidentRecordIds : [],
            incidentRecordHrefs: Array.isArray(publishResult.incidentRecordHrefs) ? publishResult.incidentRecordHrefs : [],
            error: publishResult.error?.message ?? null
          }
        : null
    }
  };
}

function buildIncidentRecords(summary, validation) {
  const findings = Array.isArray(validation?.findings) ? validation.findings : [];
  const now = summary.endedAt;
  return findings.map((finding, index) => ({
    collection: "BenchmarkIncident",
    data: {
      runId: summary.runId,
      severity: String(finding.severity ?? "failure"),
      title: `${summary.runId} ${String(finding.phase ?? "unknown")}`.slice(0, 120),
      status: "open",
      openedAt: now,
      closedAt: "",
      notes: `${finding.phase}: ${finding.message} [finding ${index + 1}]`
    }
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const runDir = args["run-dir"];
  const summaryPath = args["summary"] ?? path.join(runDir, "run-summary.json");
  const validationPath = args["validation"] ?? path.join(runDir, "validation-result.json");
  const outputPath = args["output"] ?? path.join(runDir, "dashboard-records.json");

  const [summary, validation, artifactPublishResult, dashboardPublishResult] = await Promise.all([
    readJson(summaryPath),
    readJson(validationPath),
    maybeReadJson(path.join(runDir, "artifact-publish-result.json")),
    maybeReadJson(path.join(runDir, "dashboard-publish-result.json"))
  ]);

  const records = [buildRunRecord(summary, validation, artifactPublishResult, dashboardPublishResult, outputPath), ...buildIncidentRecords(summary, validation)];
  const payload = {
    runId: summary.runId,
    generatedAt: new Date().toISOString(),
    source: {
      runSummaryPath: path.relative(process.cwd(), summaryPath),
      validationResultPath: path.relative(process.cwd(), validationPath)
    },
    records
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
