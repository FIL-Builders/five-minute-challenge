import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"] ?? process.cwd();
  const runsDir = args["runs-dir"] ?? path.join(repoRoot, "runs");
  const force = parseBoolean(args["force"] ?? "1");

  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const runs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    const [summary, validation] = await Promise.all([
      maybeReadJson(path.join(runDir, "run-summary.json")),
      maybeReadJson(path.join(runDir, "validation-result.json"))
    ]);
    if (!summary || !validation) continue;
    runs.push({
      runDir,
      runId: summary.runId ?? entry.name,
      startedAt: summary.startedAt ?? entry.name
    });
  }

  runs.sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)));

  for (const run of runs) {
    const child = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "scripts", "publish-dashboard-records.mjs"),
        "--repo-root",
        repoRoot,
        "--run-dir",
        run.runDir,
        "--force",
        force ? "1" : "0"
      ],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );

    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);

    if (child.status !== 0) {
      throw new Error(`Failed to publish dashboard history for ${run.runId}.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
