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

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}

function normalizeRuns(feed) {
  return Array.isArray(feed.runs) ? feed.runs.map((entry) => entry.data ?? {}) : [];
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"];
  const feedPath = args["feed"] ?? path.join(repoRoot, "dashboard", "local-feed.json");
  const alertsDir = args["alerts-dir"] ?? path.join(repoRoot, "alerts");
  const outputPath = args["output"] ?? path.join(alertsDir, "latest-alerts.json");
  const windowSize = Number(args["window-size"] ?? process.env.ALERT_WINDOW_SIZE ?? 10);
  const minSuccessRate = Number(args["min-success-rate"] ?? process.env.ALERT_MIN_SUCCESS_RATE ?? 80);
  const maxP95WallTimeMs = Number(args["max-p95-wall-time-ms"] ?? process.env.ALERT_MAX_P95_WALL_TIME_MS ?? 600000);
  const maxConsecutiveFailures = Number(args["max-consecutive-failures"] ?? process.env.ALERT_MAX_CONSECUTIVE_FAILURES ?? 2);

  const feed = await readJson(feedPath);
  const allRuns = normalizeRuns(feed).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const windowRuns = allRuns.slice(0, windowSize);
  const durations = windowRuns
    .map((run) => Number(run.outerWallTimeMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const successCount = windowRuns.filter((run) => run.status === "success").length;
  const successRate = windowRuns.length ? (successCount / windowRuns.length) * 100 : 0;
  const p95WallTimeMs = percentile(durations, 0.95);

  let consecutiveFailures = 0;
  for (const run of windowRuns) {
    if (run.status === "success") break;
    consecutiveFailures += 1;
  }

  const alerts = [];
  if (windowRuns.length === 0) {
    alerts.push({
      type: "no_runs",
      severity: "warning",
      message: "No benchmark runs were found in the local feed.",
      runIds: [],
      runPaths: []
    });
  }
  if (windowRuns.length > 0 && successRate < minSuccessRate) {
    alerts.push({
      type: "success_rate",
      severity: "error",
      message: `Success rate ${successRate.toFixed(1)}% is below threshold ${minSuccessRate}%.`,
      runIds: windowRuns.map((run) => run.runId),
      runPaths: windowRuns.map((run) => `runs/${run.runId}/run-summary.json`)
    });
  }
  if (p95WallTimeMs !== null && p95WallTimeMs > maxP95WallTimeMs) {
    alerts.push({
      type: "p95_wall_time",
      severity: "error",
      message: `p95 wall time ${p95WallTimeMs}ms exceeds threshold ${maxP95WallTimeMs}ms.`,
      runIds: windowRuns.map((run) => run.runId),
      runPaths: windowRuns.map((run) => `runs/${run.runId}/run-summary.json`)
    });
  }
  if (consecutiveFailures >= maxConsecutiveFailures) {
    const affected = windowRuns.slice(0, consecutiveFailures);
    alerts.push({
      type: "consecutive_failures",
      severity: "error",
      message: `${consecutiveFailures} consecutive non-success runs meets or exceeds threshold ${maxConsecutiveFailures}.`,
      runIds: affected.map((run) => run.runId),
      runPaths: affected.map((run) => `runs/${run.runId}/run-summary.json`)
    });
  }

  const result = {
    checkedAt: new Date().toISOString(),
    status: alerts.some((alert) => alert.severity === "error") ? "alert" : "ok",
    thresholds: {
      windowSize,
      minSuccessRate,
      maxP95WallTimeMs,
      maxConsecutiveFailures
    },
    metrics: {
      runCount: windowRuns.length,
      successRate,
      p95WallTimeMs,
      consecutiveFailures
    },
    alerts
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  if (alerts.length > 0) {
    const historyPath = path.join(alertsDir, "history", `${result.checkedAt.replace(/[:.]/g, "-")}.json`);
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(historyPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (result.status === "alert") {
    console.error(`Alerts triggered. See ${path.relative(process.cwd(), outputPath)}`);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
