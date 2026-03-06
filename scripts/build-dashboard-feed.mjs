import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

async function maybeReadJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getRunRecord(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return records.find((record) => record?.collection === "BenchmarkRun") ?? null;
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"] ?? process.cwd();
  const runsDir = args["runs-dir"] ?? path.join(repoRoot, "runs");
  const outputPath = args["output"] ?? path.join(repoRoot, "dashboard", "local-feed.json");
  const manifestPath = args["manifest"] ?? path.join(repoRoot, "dashboard", "generated", "manifest.json");

  const [entries, manifest] = await Promise.all([
    readdir(runsDir, { withFileTypes: true }).catch(() => []),
    maybeReadJson(manifestPath)
  ]);
  const targetDeploymentAddress = Array.isArray(manifest?.deployments)
    ? manifest.deployments.find((deployment) => deployment?.role === "primary")?.deploymentEntrypointAddress ?? manifest.deployments[0]?.deploymentEntrypointAddress ?? null
    : null;
  const feeds = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(runsDir, entry.name, "dashboard-records.json");
    const payload = await maybeReadJson(filePath);
    if (!payload) continue;
    if (targetDeploymentAddress) {
      const runRecord = getRunRecord(payload);
      const publishedToCurrentDeployment = runRecord?.meta?.dashboardPublish?.deploymentAddress === targetDeploymentAddress;
      if (!publishedToCurrentDeployment) continue;
    }
    feeds.push(payload);
  }

  feeds.sort((a, b) => String(b.runId).localeCompare(String(a.runId)));

  const runRecords = [];
  const incidentRecords = [];
  for (const payload of feeds) {
    for (const record of payload.records ?? []) {
      if (record.collection === "BenchmarkRun") runRecords.push(record);
      if (record.collection === "BenchmarkIncident") incidentRecords.push(record);
    }
  }

  const feed = {
    generatedAt: new Date().toISOString(),
    runCount: runRecords.length,
    incidentCount: incidentRecords.length,
    runs: runRecords,
    incidents: incidentRecords
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(feed, null, 2)}\n`);

  const generatedUiPublicPath = path.join(repoRoot, "dashboard", "generated", "ui", "public", "benchmark-feed.json");
  await mkdir(path.dirname(generatedUiPublicPath), { recursive: true });
  await writeFile(generatedUiPublicPath, `${JSON.stringify(feed, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
