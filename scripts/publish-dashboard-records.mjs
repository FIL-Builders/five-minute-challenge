import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

function parseTimeoutMs(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed;
}

function normalizePrivateKey(value) {
  if (!value) throw new Error("DASHBOARD_PRIVATE_KEY, PRIVATE_KEY, or --private-key is required for dashboard publication.");
  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeString(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function inputValueForType(type, value) {
  if (type === "uint256") return BigInt(normalizeString(value || "0"));
  if (type === "bool") return Boolean(value);
  if (type === "address") return normalizeString(value || "0x0000000000000000000000000000000000000000");
  return normalizeString(value);
}

function buildChain(chainConfig) {
  const endpoint = chainConfig?.rpc?.endpoints?.[0]?.url;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("Chain config is missing a usable RPC endpoint.");
  }

  const explorer = Array.isArray(chainConfig?.explorers) ? chainConfig.explorers[0] : null;

  return defineChain({
    id: Number(chainConfig.chainId),
    name: String(chainConfig.name),
    nativeCurrency: {
      name: String(chainConfig.nativeCurrency?.name ?? "native"),
      symbol: String(chainConfig.nativeCurrency?.symbol ?? "NATIVE"),
      decimals: Number(chainConfig.nativeCurrency?.decimals ?? 18)
    },
    rpcUrls: {
      default: { http: [endpoint] },
      public: { http: [endpoint] }
    },
    blockExplorers: explorer
      ? {
          default: {
            name: String(explorer.name ?? "Explorer"),
            url: String(explorer.url)
          }
        }
      : undefined
  });
}

function getPrimaryDeployment(manifest) {
  const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
  return deployments.find((deployment) => deployment?.role === "primary") ?? deployments[0] ?? null;
}

function getCollectionSchema(schema, collectionName) {
  const collection = Array.isArray(schema?.collections)
    ? schema.collections.find((entry) => entry?.name === collectionName)
    : null;
  if (!collection) throw new Error(`Collection not found in dashboard schema: ${collectionName}`);
  return collection;
}

function buildCreateInput(schema, record) {
  const collection = getCollectionSchema(schema, record.collection);
  const data = record?.data ?? {};
  const input = {};
  for (const field of collection.fields ?? []) {
    input[field.name] = inputValueForType(field.type, data[field.name]);
  }
  return input;
}

function buildViewHref(collectionName, recordId) {
  return `/${collectionName}/view/?id=${encodeURIComponent(String(recordId))}`;
}

function toIsoTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

async function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function serializeError(error, extra = {}) {
  return {
    message: error instanceof Error ? error.message : String(error),
    ...extra
  };
}

async function publishRecord({ publicClient, walletClient, account, abi, address, schema, record, timeoutMs }) {
  const functionName = `create${record.collection}`;
  const input = buildCreateInput(schema, record);
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args: [input],
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Published ${record.collection} tx submitted: ${hash}`);
  await withTimeout(
    publicClient.waitForTransactionReceipt({ hash }),
    timeoutMs,
    `Timed out waiting for ${record.collection} transaction receipt after ${timeoutMs}ms: ${hash}`
  );

  return {
    collection: record.collection,
    recordId: String(simulation.result),
    txHash: hash,
    href: buildViewHref(record.collection, simulation.result)
  };
}

async function recoverPublishedRun({ publicClient, abi, address, runId }) {
  const count = Number(
    await publicClient.readContract({
      address,
      abi,
      functionName: "getCountBenchmarkRun",
      args: [false]
    })
  );
  if (!Number.isFinite(count) || count <= 0) return null;

  const ids = await publicClient.readContract({
    address,
    abi,
    functionName: "listIdsBenchmarkRun",
    args: [0n, BigInt(count), false]
  });

  for (const id of ids) {
    const record = await publicClient.readContract({
      address,
      abi,
      functionName: "getBenchmarkRun",
      args: [id, false]
    });
    if (record?.runId === runId) {
      return {
        collection: "BenchmarkRun",
        recordId: String(record.id),
        txHash: null,
        href: buildViewHref("BenchmarkRun", record.id),
        publishedAt: toIsoTimestamp(record.createdAt)
      };
    }
  }

  return null;
}

async function recoverPublishedIncidents({ publicClient, abi, address, runId }) {
  const count = Number(
    await publicClient.readContract({
      address,
      abi,
      functionName: "getCountBenchmarkIncident",
      args: [false]
    })
  );
  if (!Number.isFinite(count) || count <= 0) return [];

  const ids = await publicClient.readContract({
    address,
    abi,
    functionName: "listIdsBenchmarkIncident",
    args: [0n, BigInt(count), false]
  });

  const matches = [];
  for (const id of ids) {
    const record = await publicClient.readContract({
      address,
      abi,
      functionName: "getBenchmarkIncident",
      args: [id, false]
    });
    if (record?.runId === runId) {
      matches.push({
        collection: "BenchmarkIncident",
        recordId: String(record.id),
        txHash: null,
        href: buildViewHref("BenchmarkIncident", record.id),
        publishedAt: toIsoTimestamp(record.createdAt)
      });
    }
  }

  return matches.sort((left, right) => Number(left.recordId) - Number(right.recordId));
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = args["repo-root"] ?? process.cwd();
  const runDir = args["run-dir"];
  const recordsPath = args["records"] ?? path.join(runDir, "dashboard-records.json");
  const manifestPath = args["manifest"] ?? path.join(repoRoot, "dashboard", "generated", "manifest.json");
  const compiledPath = args["compiled"] ?? path.join(repoRoot, "dashboard", "generated", "compiled", "App.json");
  const schemaPath = args["schema"] ?? path.join(repoRoot, "dashboard", "schema.json");
  const resultPath = args["output"] ?? path.join(runDir, "dashboard-publish-result.json");
  const timeoutMs = parseTimeoutMs(args["timeout-ms"] ?? process.env.DASHBOARD_PUBLISH_TIMEOUT_MS ?? "", 180000);

  if (!runDir) throw new Error("--run-dir is required.");
  const existingResult = await maybeReadJson(resultPath);
  if (existingResult?.status === "success") {
    return;
  }

  const privateKey = normalizePrivateKey(args["private-key"] ?? process.env.DASHBOARD_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "");
  const [payload, manifest, compiled, schema] = await Promise.all([
    readJson(recordsPath),
    readJson(manifestPath),
    readJson(compiledPath),
    readJson(schemaPath)
  ]);

  const deployment = getPrimaryDeployment(manifest);
  if (!deployment?.deploymentEntrypointAddress) {
    throw new Error("Dashboard manifest is missing a primary deployment address.");
  }
  const chainConfigUrl = deployment?.chainConfig?.url;
  const chainConfigPath = typeof chainConfigUrl === "string" && chainConfigUrl.startsWith("file://")
    ? new URL(chainConfigUrl).pathname
    : path.join(repoRoot, "dashboard", "generated", "chain-config", `${deployment.chainName}.json`);
  const chainConfig = await readJson(chainConfigPath);
  const chain = buildChain(chainConfig);
  const account = privateKeyToAccount(privateKey);
  const abi = compiled.abi;
  const address = deployment.deploymentEntrypointAddress;

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0])
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0])
  });

  let publishedRecords = [];
  let failure = null;
  for (const record of payload.records ?? []) {
    try {
      publishedRecords.push(await publishRecord({ publicClient, walletClient, account, abi, address, schema, record, timeoutMs }));
    } catch (error) {
      failure = serializeError(error, {
        collection: record.collection
      });
      break;
    }
  }

  let recovered = false;
  let recoveredPublishedAt = null;
  if (failure?.collection === "BenchmarkRun" && failure.message.includes("UniqueViolation()")) {
    const recoveredRun = await recoverPublishedRun({ publicClient, abi, address, runId: payload.runId });
    if (recoveredRun) {
      const recoveredIncidents = await recoverPublishedIncidents({ publicClient, abi, address, runId: payload.runId });
      publishedRecords = [recoveredRun, ...recoveredIncidents];
      recovered = true;
      recoveredPublishedAt = recoveredRun.publishedAt;
      failure = null;
    }
  }

  const runRecord = publishedRecords.find((record) => record.collection === "BenchmarkRun") ?? null;
  const incidentRecords = publishedRecords.filter((record) => record.collection === "BenchmarkIncident");

  const result = {
    status: failure ? "failed" : "success",
    publishedAt: failure ? null : (recoveredPublishedAt ?? new Date().toISOString()),
    attemptedAt: new Date().toISOString(),
    recovered,
    runId: payload.runId,
    chainId: Number(chain.id),
    chainName: deployment.chainName ?? chain.name,
    deploymentAddress: address,
    manifestPath: path.relative(repoRoot, manifestPath),
    recordsPath: path.relative(repoRoot, recordsPath),
    timeoutMs,
    publishedRecords,
    runRecordId: runRecord?.recordId ?? null,
    runRecordHref: runRecord?.href ?? null,
    incidentRecordIds: incidentRecords.map((record) => record.recordId),
    incidentRecordHrefs: incidentRecords.map((record) => record.href),
    error: failure
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  const refreshDashboardRecords = spawnSync(
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

  if (refreshDashboardRecords.status !== 0) {
    throw new Error(refreshDashboardRecords.stderr || refreshDashboardRecords.stdout || "Failed to refresh dashboard records after on-chain publication.");
  }

  const refreshFeed = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "build-dashboard-feed.mjs"), "--repo-root", repoRoot],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  if (refreshFeed.status !== 0) {
    throw new Error(refreshFeed.stderr || refreshFeed.stdout || "Failed to refresh dashboard feed after on-chain publication.");
  }

  if (failure) {
    throw new Error(failure.message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
