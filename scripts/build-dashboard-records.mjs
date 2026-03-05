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

function normalizeNotes(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildRunRecord(summary) {
  return {
    collection: "BenchmarkRun",
    data: {
      runId: summary.runId,
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
      operatorNotes: normalizeNotes(summary.operatorNotes) ?? ""
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

  const summary = await readJson(summaryPath);
  const validation = await readJson(validationPath);

  const records = [buildRunRecord(summary), ...buildIncidentRecords(summary, validation)];
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
