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

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "n/a";
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function humanizeMode(mode) {
  if (mode === "fresh-follow-docs") return "fresh wallet";
  if (mode === "inherited-key-follow-docs") return "inherited funded wallet";
  return mode || "unknown mode";
}

function summarizeFunding(summary) {
  const fundingSource = summary?.evidence?.fundingSource ?? null;
  if (fundingSource === "inherited_wallet_prefunded") return "reused a pre-funded inherited wallet";
  if (summary?.evidence?.fundingTxHash) return "generated a wallet and acquired funds during the run";
  if (summary?.walletAddress) return "used wallet " + summary.walletAddress;
  return "wallet setup details were incomplete";
}

function summarizeStorage(summary) {
  if (summary?.evidence?.pieceCid && summary?.evidence?.contentMatch) {
    return `uploaded and downloaded content successfully with integrity verified for piece ${summary.evidence.pieceCid}`;
  }
  if (summary?.failurePhase) {
    return `stopped during ${summary.failurePhase}`;
  }
  return "storage outcome was not fully captured";
}

function summarizeArtifacts(summary) {
  if (summary?.artifacts?.artifactIndexHttpUrl && summary?.artifacts?.artifactBundleHttpUrl) {
    return "published both the artifact index and full bundle to Filecoin Cloud retrieval URLs";
  }
  if (summary?.artifacts?.artifactBundleHttpUrl) {
    return "published the bundle to Filecoin Cloud but artifact indexing is incomplete";
  }
  return "artifact publication has not completed";
}

function buildTimingInsights(summary) {
  const phases = Array.isArray(summary?.agentPhaseData) ? summary.agentPhaseData : [];
  const longestPhase = phases
    .filter((phase) => Number.isFinite(Number(phase?.durationMs)))
    .sort((a, b) => Number(b.durationMs) - Number(a.durationMs))[0] ?? null;
  return {
    outerWallTimeMs: Number(summary?.outerWallTimeMs ?? 0),
    outerWallTimeLabel: formatDuration(summary?.outerWallTimeMs ?? 0),
    longestPhase: longestPhase
      ? {
          phase: String(longestPhase.phase ?? "unknown"),
          durationMs: Number(longestPhase.durationMs),
          durationLabel: formatDuration(longestPhase.durationMs)
        }
      : null,
    phases: phases.map((phase) => ({
      phase: String(phase?.phase ?? "unknown"),
      durationMs: Number(phase?.durationMs ?? 0),
      durationLabel: formatDuration(phase?.durationMs ?? 0),
      startedAt: phase?.startedAt ?? null,
      endedAt: phase?.endedAt ?? null
    }))
  };
}

function buildInsights(summary, validation, artifactPublishResult, publishResult) {
  const status = summary?.status ?? "unknown";
  const modeLabel = humanizeMode(summary?.mode);
  const failurePhase = summary?.failurePhase ?? validation?.failurePhase ?? null;
  const timing = buildTimingInsights(summary);
  const findings = Array.isArray(validation?.findings) ? validation.findings : [];

  let headline = `Benchmark execution ${summary?.runId} ${status}`;
  if (status === "success") {
    headline = `Benchmark execution succeeded using ${modeLabel} flow`;
  } else if (failurePhase) {
    headline = `Benchmark execution failed during ${failurePhase}`;
  }

  const bullets = [
    `Credential strategy: ${modeLabel}; ${summarizeFunding(summary)}.`,
    `Storage result: ${summarizeStorage(summary)}.`,
    `Artifacts: ${summarizeArtifacts(summary)}.`,
    `Timing: total wall time ${timing.outerWallTimeLabel}${timing.longestPhase ? `; longest measured agent phase was ${timing.longestPhase.phase} at ${timing.longestPhase.durationLabel}` : ""}.`
  ];

  if (publishResult?.deploymentAddress && publishResult?.runRecordId) {
    bullets.push(`Registry publication: published to Calibration at ${publishResult.deploymentAddress} as BenchmarkRun record ${publishResult.runRecordId}.`);
  }
  if (findings.length > 0) {
    bullets.push(`Validator findings: ${findings.map((finding) => `${finding.phase}: ${finding.message}`).join(" | ")}.`);
  }
  if (typeof summary?.operatorNotes === "string" && summary.operatorNotes.trim()) {
    bullets.push(`Operator notes: ${summary.operatorNotes.trim()}`);
  }

  return {
    headline,
    summary:
      status === "success"
        ? "This benchmark execution completed end to end and produced verifiable Filecoin-hosted evidence."
        : "This benchmark execution did not complete successfully; see the failure phase and evidence trail below.",
    bullets,
    timing
  };
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
      status: summary.status,
      failurePhase: summary.failurePhase ?? "",
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      outerWallTimeMs: String(summary.outerWallTimeMs),
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
            evidenceRecordId: publishResult.evidenceRecordId ?? null,
            evidenceRecordHref: publishResult.evidenceRecordHref ?? null,
            artifactsRecordId: publishResult.artifactsRecordId ?? null,
            artifactsRecordHref: publishResult.artifactsRecordHref ?? null,
            feedbackRecordId: publishResult.feedbackRecordId ?? null,
            feedbackRecordHref: publishResult.feedbackRecordHref ?? null,
            incidentRecordIds: Array.isArray(publishResult.incidentRecordIds) ? publishResult.incidentRecordIds : [],
            incidentRecordHrefs: Array.isArray(publishResult.incidentRecordHrefs) ? publishResult.incidentRecordHrefs : [],
            error: publishResult.error?.message ?? null
          }
        : null,
      insights: buildInsights(summary, validation, artifactPublishResult, publishResult)
    }
  };
}

function buildEvidenceRecord(summary) {
  return {
    collection: "BenchmarkEvidence",
    data: {
      runId: summary.runId,
      docsSnapshotHash: summary.docsSnapshotHash ?? "",
      walletAddress: summary.walletAddress ?? "0x0000000000000000000000000000000000000000",
      fundingTxHash: summary.evidence?.fundingTxHash ?? "",
      depositTxHash: summary.evidence?.depositTxHash ?? "",
      pieceCid: summary.evidence?.pieceCid ?? "",
      contentMatch: Boolean(summary.evidence?.contentMatch)
    }
  };
}

function buildArtifactsRecord(summary) {
  return {
    collection: "BenchmarkArtifacts",
    data: {
      runId: summary.runId,
      artifactBundleUri: summary.artifacts?.artifactBundleUri ?? "",
      artifactBundleHash: summary.artifacts?.artifactBundleHash ?? "",
      artifactBundleHttpUrl: summary.artifacts?.artifactBundleHttpUrl ?? "",
      artifactIndexUri: summary.artifacts?.artifactIndexUri ?? "",
      artifactIndexHash: summary.artifacts?.artifactIndexHash ?? "",
      artifactIndexHttpUrl: summary.artifacts?.artifactIndexHttpUrl ?? ""
    }
  };
}

function buildFeedbackRecord(summary) {
  const whatWorkedWell = normalizeNotes(summary.feedback?.whatWorkedWell) ?? "";
  const frictionFailures = normalizeNotes(summary.feedback?.frictionFailures) ?? "";
  const recommendations = normalizeNotes(summary.feedback?.recommendations) ?? "";
  if (!whatWorkedWell && !frictionFailures && !recommendations) return null;

  return {
    collection: "BenchmarkFeedback",
    data: {
      runId: summary.runId,
      whatWorkedWell,
      frictionFailures,
      recommendations
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

  const feedbackRecord = buildFeedbackRecord(summary);
  const records = [
    buildRunRecord(summary, validation, artifactPublishResult, dashboardPublishResult, outputPath),
    buildEvidenceRecord(summary),
    buildArtifactsRecord(summary),
    ...(feedbackRecord ? [feedbackRecord] : []),
    ...buildIncidentRecords(summary, validation)
  ];
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
