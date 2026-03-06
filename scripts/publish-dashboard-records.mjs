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

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
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

function getFunctionAbi(abi, functionName) {
  const entry = Array.isArray(abi)
    ? abi.find((item) => item?.type === "function" && item?.name === functionName)
    : null;
  if (!entry) throw new Error(`Function not found in ABI: ${functionName}`);
  return entry;
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

function buildUpdateArgs(abi, functionName, recordId, record) {
  const fn = getFunctionAbi(abi, functionName);
  const data = record?.data ?? {};
  const args = [BigInt(recordId)];
  for (const input of fn.inputs.slice(1)) {
    args.push(inputValueForType(input.type, data[input.name]));
  }
  return args;
}

function buildViewHref(collectionName, recordId) {
  return `/${collectionName}/?mode=view&id=${encodeURIComponent(String(recordId))}`;
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

async function waitForReceipt({ publicClient, hash, timeoutMs, label }) {
  await withTimeout(
    publicClient.waitForTransactionReceipt({ hash }),
    timeoutMs,
    `Timed out waiting for ${label} transaction receipt after ${timeoutMs}ms: ${hash}`
  );
}

async function createRecord({ publicClient, walletClient, account, abi, address, schema, record, timeoutMs }) {
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
  await waitForReceipt({ publicClient, hash, timeoutMs, label: record.collection });

  return {
    collection: record.collection,
    recordId: String(simulation.result),
    txHash: hash,
    href: buildViewHref(record.collection, simulation.result)
  };
}

async function updateRunRecord({ publicClient, walletClient, account, abi, address, recordId, record, timeoutMs }) {
  const functionName = "updateBenchmarkRun";
  const args = buildUpdateArgs(abi, functionName, recordId, record);
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Updated BenchmarkRun tx submitted: ${hash}`);
  await waitForReceipt({ publicClient, hash, timeoutMs, label: "BenchmarkRun update" });

  return {
    collection: "BenchmarkRun",
    recordId: String(recordId),
    txHash: hash,
    href: buildViewHref("BenchmarkRun", recordId)
  };
}

async function updateFeedbackRecord({ publicClient, walletClient, account, abi, address, recordId, record, timeoutMs }) {
  const functionName = "updateBenchmarkFeedback";
  const args = buildUpdateArgs(abi, functionName, recordId, record);
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Updated BenchmarkFeedback tx submitted: ${hash}`);
  await waitForReceipt({ publicClient, hash, timeoutMs, label: "BenchmarkFeedback update" });

  return {
    collection: "BenchmarkFeedback",
    recordId: String(recordId),
    txHash: hash,
    href: buildViewHref("BenchmarkFeedback", recordId)
  };
}

async function updateEvidenceRecord({ publicClient, walletClient, account, abi, address, recordId, record, timeoutMs }) {
  const functionName = "updateBenchmarkEvidence";
  const args = buildUpdateArgs(abi, functionName, recordId, record);
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Updated BenchmarkEvidence tx submitted: ${hash}`);
  await waitForReceipt({ publicClient, hash, timeoutMs, label: "BenchmarkEvidence update" });

  return {
    collection: "BenchmarkEvidence",
    recordId: String(recordId),
    txHash: hash,
    href: buildViewHref("BenchmarkEvidence", recordId)
  };
}

async function updateArtifactsRecord({ publicClient, walletClient, account, abi, address, recordId, record, timeoutMs }) {
  const functionName = "updateBenchmarkArtifacts";
  const args = buildUpdateArgs(abi, functionName, recordId, record);
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Updated BenchmarkArtifacts tx submitted: ${hash}`);
  await waitForReceipt({ publicClient, hash, timeoutMs, label: "BenchmarkArtifacts update" });

  return {
    collection: "BenchmarkArtifacts",
    recordId: String(recordId),
    txHash: hash,
    href: buildViewHref("BenchmarkArtifacts", recordId)
  };
}

async function deleteIncidentRecord({ publicClient, walletClient, account, abi, address, recordId, timeoutMs }) {
  const functionName = "deleteBenchmarkIncident";
  const simulation = await publicClient.simulateContract({
    address,
    abi,
    functionName,
    args: [BigInt(recordId)],
    account: account.address
  });
  const hash = await walletClient.writeContract({
    ...simulation.request,
    account
  });
  console.error(`Deleted BenchmarkIncident tx submitted: ${hash}`);
  await waitForReceipt({ publicClient, hash, timeoutMs, label: "BenchmarkIncident delete" });
  return hash;
}

async function findBenchmarkRunByRunId({ publicClient, abi, address, runId }) {
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
        id: String(record.id),
        createdAt: toIsoTimestamp(record.createdAt)
      };
    }
  }

  return null;
}

async function listBenchmarkIncidentsByRunId({ publicClient, abi, address, runId }) {
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
        id: String(record.id),
        href: buildViewHref("BenchmarkIncident", id)
      });
    }
  }

  return matches.sort((left, right) => Number(left.id) - Number(right.id));
}

async function findBenchmarkFeedbackByRunId({ publicClient, abi, address, runId }) {
  const count = Number(
    await publicClient.readContract({
      address,
      abi,
      functionName: "getCountBenchmarkFeedback",
      args: [false]
    })
  );
  if (!Number.isFinite(count) || count <= 0) return null;

  const ids = await publicClient.readContract({
    address,
    abi,
    functionName: "listIdsBenchmarkFeedback",
    args: [0n, BigInt(count), false]
  });

  for (const id of ids) {
    const record = await publicClient.readContract({
      address,
      abi,
      functionName: "getBenchmarkFeedback",
      args: [id, false]
    });
    if (record?.runId === runId) {
      return {
        id: String(record.id),
        href: buildViewHref("BenchmarkFeedback", id)
      };
    }
  }

  return null;
}

async function findBenchmarkEvidenceByRunId({ publicClient, abi, address, runId }) {
  const count = Number(
    await publicClient.readContract({
      address,
      abi,
      functionName: "getCountBenchmarkEvidence",
      args: [false]
    })
  );
  if (!Number.isFinite(count) || count <= 0) return null;

  const ids = await publicClient.readContract({
    address,
    abi,
    functionName: "listIdsBenchmarkEvidence",
    args: [0n, BigInt(count), false]
  });

  for (const id of ids) {
    const record = await publicClient.readContract({
      address,
      abi,
      functionName: "getBenchmarkEvidence",
      args: [id, false]
    });
    if (record?.runId === runId) {
      return {
        id: String(record.id),
        href: buildViewHref("BenchmarkEvidence", id)
      };
    }
  }

  return null;
}

async function findBenchmarkArtifactsByRunId({ publicClient, abi, address, runId }) {
  const count = Number(
    await publicClient.readContract({
      address,
      abi,
      functionName: "getCountBenchmarkArtifacts",
      args: [false]
    })
  );
  if (!Number.isFinite(count) || count <= 0) return null;

  const ids = await publicClient.readContract({
    address,
    abi,
    functionName: "listIdsBenchmarkArtifacts",
    args: [0n, BigInt(count), false]
  });

  for (const id of ids) {
    const record = await publicClient.readContract({
      address,
      abi,
      functionName: "getBenchmarkArtifacts",
      args: [id, false]
    });
    if (record?.runId === runId) {
      return {
        id: String(record.id),
        href: buildViewHref("BenchmarkArtifacts", id)
      };
    }
  }

  return null;
}

function refreshOutputs({ repoRoot, runDir }) {
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
  const force = parseBoolean(args["force"] ?? "0");

  if (!runDir) throw new Error("--run-dir is required.");

  const privateKey = normalizePrivateKey(args["private-key"] ?? process.env.DASHBOARD_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "");
  const [payload, manifest, compiled, schema, existingResult] = await Promise.all([
    readJson(recordsPath),
    readJson(manifestPath),
    readJson(compiledPath),
    readJson(schemaPath),
    maybeReadJson(resultPath)
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

  if (existingResult?.status === "success" && existingResult.deploymentAddress === address && !force) {
    return;
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0])
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0])
  });

  const runRecord = (payload.records ?? []).find((record) => record.collection === "BenchmarkRun");
  if (!runRecord) throw new Error(`No BenchmarkRun record found in ${recordsPath}.`);
  const evidenceRecord = (payload.records ?? []).find((record) => record.collection === "BenchmarkEvidence") ?? null;
  const artifactsRecord = (payload.records ?? []).find((record) => record.collection === "BenchmarkArtifacts") ?? null;
  const feedbackRecord = (payload.records ?? []).find((record) => record.collection === "BenchmarkFeedback") ?? null;
  const desiredIncidents = (payload.records ?? []).filter((record) => record.collection === "BenchmarkIncident");

  let failure = null;
  let runPublication = null;
  let evidencePublication = null;
  let artifactsPublication = null;
  let feedbackPublication = null;
  let deletedIncidentIds = [];
  let publishedIncidents = [];
  let reconciled = false;

  try {
    const existingRun = await findBenchmarkRunByRunId({ publicClient, abi, address, runId: payload.runId });
    if (existingRun) {
      reconciled = true;
      runPublication = await updateRunRecord({
        publicClient,
        walletClient,
        account,
        abi,
        address,
        recordId: existingRun.id,
        record: runRecord,
        timeoutMs
      });
      runPublication.publishedAt = existingRun.createdAt;
    } else {
      runPublication = await createRecord({
        publicClient,
        walletClient,
        account,
        abi,
        address,
        schema,
        record: runRecord,
        timeoutMs
      });
      runPublication.publishedAt = new Date().toISOString();
    }

    if (evidenceRecord) {
      const existingEvidence = await findBenchmarkEvidenceByRunId({ publicClient, abi, address, runId: payload.runId });
      if (existingEvidence) {
        reconciled = true;
        evidencePublication = await updateEvidenceRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          recordId: existingEvidence.id,
          record: evidenceRecord,
          timeoutMs
        });
      } else {
        evidencePublication = await createRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          schema,
          record: evidenceRecord,
          timeoutMs
        });
      }
    }

    if (artifactsRecord) {
      const existingArtifacts = await findBenchmarkArtifactsByRunId({ publicClient, abi, address, runId: payload.runId });
      if (existingArtifacts) {
        reconciled = true;
        artifactsPublication = await updateArtifactsRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          recordId: existingArtifacts.id,
          record: artifactsRecord,
          timeoutMs
        });
      } else {
        artifactsPublication = await createRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          schema,
          record: artifactsRecord,
          timeoutMs
        });
      }
    }

    if (feedbackRecord) {
      const existingFeedback = await findBenchmarkFeedbackByRunId({ publicClient, abi, address, runId: payload.runId });
      if (existingFeedback) {
        reconciled = true;
        feedbackPublication = await updateFeedbackRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          recordId: existingFeedback.id,
          record: feedbackRecord,
          timeoutMs
        });
      } else {
        feedbackPublication = await createRecord({
          publicClient,
          walletClient,
          account,
          abi,
          address,
          schema,
          record: feedbackRecord,
          timeoutMs
        });
      }
    }

    const existingIncidents = await listBenchmarkIncidentsByRunId({ publicClient, abi, address, runId: payload.runId });
    for (const incident of existingIncidents) {
      await deleteIncidentRecord({
        publicClient,
        walletClient,
        account,
        abi,
        address,
        recordId: incident.id,
        timeoutMs
      });
      deletedIncidentIds.push(String(incident.id));
      reconciled = true;
    }

    for (const record of desiredIncidents) {
      publishedIncidents.push(await createRecord({
        publicClient,
        walletClient,
        account,
        abi,
        address,
        schema,
        record,
        timeoutMs
      }));
    }
  } catch (error) {
    failure = serializeError(error);
  }

  const result = {
    status: failure ? "failed" : "success",
    publishedAt: failure ? null : (runPublication?.publishedAt ?? new Date().toISOString()),
    attemptedAt: new Date().toISOString(),
    reconciled,
    runId: payload.runId,
    chainId: Number(chain.id),
    chainName: deployment.chainName ?? chain.name,
    deploymentAddress: address,
    manifestPath: path.relative(repoRoot, manifestPath),
    recordsPath: path.relative(repoRoot, recordsPath),
    timeoutMs,
    deletedIncidentIds,
    publishedRecords: [runPublication, evidencePublication, artifactsPublication, feedbackPublication, ...publishedIncidents].filter(Boolean),
    runRecordId: runPublication?.recordId ?? null,
    runRecordHref: runPublication?.href ?? null,
    evidenceRecordId: evidencePublication?.recordId ?? null,
    evidenceRecordHref: evidencePublication?.href ?? null,
    artifactsRecordId: artifactsPublication?.recordId ?? null,
    artifactsRecordHref: artifactsPublication?.href ?? null,
    feedbackRecordId: feedbackPublication?.recordId ?? null,
    feedbackRecordHref: feedbackPublication?.href ?? null,
    incidentRecordIds: publishedIncidents.map((record) => record.recordId),
    incidentRecordHrefs: publishedIncidents.map((record) => record.href),
    error: failure
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  refreshOutputs({ repoRoot, runDir });

  if (failure) {
    throw new Error(failure.message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
