import { loadAppRuntime, listAllRecords, type AppRuntime } from './runtime';

export type ArtifactLink = {
  artifactKey: string;
  runId: string;
  label: string;
  path: string;
  url: string | null;
  uri?: string | null;
  hash?: string | null;
  pieceCid?: string | null;
  displayOrder: number;
  recordId: string;
};

export type BenchmarkIncidentRecord = {
  recordId: string;
  runId: string;
  severity: string;
  title: string;
  status: string;
  openedAt: string;
  closedAt: string;
  notes: string;
  createdAt: string | null;
};

export type BenchmarkPhaseTimingRecord = {
  recordId: string;
  phaseKey: string;
  runId: string;
  phase: string;
  startedAt: string;
  endedAt: string;
  durationMs: string;
  displayOrder: number;
};

export type BenchmarkExecutionRecord = {
  recordId: string;
  createdAt: string | null;
  runId: string;
  mode: string;
  promptVersion: string;
  model: string;
  repoSha: string;
  docsUrl: string;
  status: string;
  failurePhase: string;
  startedAt: string;
  endedAt: string;
  outerWallTimeMs: string;
  operatorNotes: string;
  docsSnapshotHash: string;
  walletAddress: string;
  fundingTxHash: string;
  depositTxHash: string;
  pieceCid: string;
  contentMatch: boolean;
  artifactBundleUri: string;
  artifactBundleHash: string;
  artifactBundleHttpUrl: string;
  artifactIndexUri: string;
  artifactIndexHash: string;
  artifactIndexHttpUrl: string;
  whatWorkedWell: string;
  frictionFailures: string;
  recommendations: string;
  publishedArtifacts: ArtifactLink[];
  phases: BenchmarkPhaseTimingRecord[];
  incidents: BenchmarkIncidentRecord[];
};

export type BenchmarkDashboardSnapshot = {
  runtime: AppRuntime;
  runs: BenchmarkExecutionRecord[];
  incidents: BenchmarkIncidentRecord[];
  latestPublishedAt: string | null;
};

export type BenchmarkExecutionInsights = {
  headline: string;
  summary: string;
  bullets: string[];
  timing: {
    outerWallTimeMs: number;
    outerWallTimeLabel: string;
    longestPhase: {
      phase: string;
      durationMs: number;
      durationLabel: string;
    } | null;
    phases: Array<{
      phase: string;
      durationMs: number;
      durationLabel: string;
      startedAt: string | null;
      endedAt: string | null;
    }>;
  };
};

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return '';
  return String(value);
}

function toNumberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return Boolean(value);
}

function toIsoTimestamp(value: unknown): string | null {
  const numeric = toNumberValue(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

function sortByDisplayOrder<T extends { displayOrder: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.displayOrder - right.displayOrder);
}

function sortByStartedAtDesc<T extends { startedAt: string; createdAt: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftKey = left.startedAt || left.createdAt || '';
    const rightKey = right.startedAt || right.createdAt || '';
    return rightKey.localeCompare(leftKey);
  });
}

function normalizeIncident(record: any): BenchmarkIncidentRecord {
  return {
    recordId: toStringValue(record?.id),
    runId: toStringValue(record?.runId),
    severity: toStringValue(record?.severity),
    title: toStringValue(record?.title),
    status: toStringValue(record?.status),
    openedAt: toStringValue(record?.openedAt),
    closedAt: toStringValue(record?.closedAt),
    notes: toStringValue(record?.notes),
    createdAt: toIsoTimestamp(record?.createdAt)
  };
}

function normalizePublishedArtifact(record: any, runId: string, index: number): ArtifactLink {
  return {
    artifactKey: toStringValue(record?.artifactKey) || `${runId}:${toStringValue(record?.path)}`,
    runId,
    label: toStringValue(record?.label),
    path: toStringValue(record?.path),
    url: toStringValue(record?.httpUrl ?? record?.url) || null,
    uri: toStringValue(record?.uri) || null,
    hash: toStringValue(record?.hash) || null,
    pieceCid: toStringValue(record?.pieceCid) || null,
    displayOrder: Number.isFinite(Number(record?.displayOrder)) ? toNumberValue(record?.displayOrder) : index,
    recordId: toStringValue(record?.id)
  };
}

function normalizePhaseTiming(record: any, runId: string, index: number): BenchmarkPhaseTimingRecord {
  return {
    recordId: toStringValue(record?.id),
    phaseKey: toStringValue(record?.phaseKey) || `${runId}:${String(index).padStart(2, '0')}:${toStringValue(record?.phase)}`,
    runId,
    phase: toStringValue(record?.phase),
    startedAt: toStringValue(record?.startedAt),
    endedAt: toStringValue(record?.endedAt),
    durationMs: toStringValue(record?.durationMs),
    displayOrder: Number.isFinite(Number(record?.displayOrder)) ? toNumberValue(record?.displayOrder) : index
  };
}

function groupByRunId<T extends { runId: string }>(records: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const record of records) {
    const key = record.runId;
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      map.set(key, [record]);
    }
  }
  return map;
}

function parseJsonArray(value: string): any[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadBenchmarkDashboardSnapshot(rpcOverride?: string): Promise<BenchmarkDashboardSnapshot> {
  const runtime = await loadAppRuntime(rpcOverride);
  const readArgs = {
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress
  };

  const [
    runPage,
    evidencePage,
    artifactsPage,
    feedbackPage,
    incidentPage
  ] = await Promise.all([
    listAllRecords({ ...readArgs, collectionName: 'BenchmarkRun' }),
    listAllRecords({ ...readArgs, collectionName: 'BenchmarkEvidence' }),
    listAllRecords({ ...readArgs, collectionName: 'BenchmarkArtifacts' }),
    listAllRecords({ ...readArgs, collectionName: 'BenchmarkFeedback' }),
    listAllRecords({ ...readArgs, collectionName: 'BenchmarkIncident' })
  ]);

  const evidenceByRun = new Map(
    evidencePage.records.map((record) => [toStringValue(record?.runId), record])
  );
  const artifactSummaryByRun = new Map(
    artifactsPage.records.map((record) => [toStringValue(record?.runId), record])
  );
  const feedbackByRun = new Map(
    feedbackPage.records.map((record) => [toStringValue(record?.runId), record])
  );
  const incidentByRun = groupByRunId(incidentPage.records.map(normalizeIncident));

  const runs = sortByStartedAtDesc(
    runPage.records.map((record) => {
      const runId = toStringValue(record?.runId);
      const evidence = evidenceByRun.get(runId);
      const artifactSummary = artifactSummaryByRun.get(runId);
      const feedback = feedbackByRun.get(runId);
      const publishedArtifacts = sortByDisplayOrder(
        parseJsonArray(toStringValue(artifactSummary?.publishedArtifactsJson)).map((entry, index) =>
          normalizePublishedArtifact(entry, runId, index)
        )
      );
      const phases = sortByDisplayOrder(
        parseJsonArray(toStringValue(record?.phaseTimingsJson)).map((entry, index) =>
          normalizePhaseTiming(entry, runId, index)
        )
      );
      const incidents = [...(incidentByRun.get(runId) ?? [])].sort((left, right) => right.openedAt.localeCompare(left.openedAt));

      return {
        recordId: toStringValue(record?.id),
        createdAt: toIsoTimestamp(record?.createdAt),
        runId,
        mode: toStringValue(record?.mode),
        promptVersion: toStringValue(record?.promptVersion),
        model: toStringValue(record?.model),
        repoSha: toStringValue(record?.repoSha),
        docsUrl: toStringValue(record?.docsUrl),
        status: toStringValue(record?.status),
        failurePhase: toStringValue(record?.failurePhase),
        startedAt: toStringValue(record?.startedAt),
        endedAt: toStringValue(record?.endedAt),
        outerWallTimeMs: toStringValue(record?.outerWallTimeMs),
        operatorNotes: toStringValue(record?.operatorNotes),
        docsSnapshotHash: toStringValue(evidence?.docsSnapshotHash),
        walletAddress: toStringValue(evidence?.walletAddress),
        fundingTxHash: toStringValue(evidence?.fundingTxHash),
        depositTxHash: toStringValue(evidence?.depositTxHash),
        pieceCid: toStringValue(evidence?.pieceCid),
        contentMatch: toBooleanValue(evidence?.contentMatch),
        artifactBundleUri: toStringValue(artifactSummary?.artifactBundleUri),
        artifactBundleHash: toStringValue(artifactSummary?.artifactBundleHash),
        artifactBundleHttpUrl: toStringValue(artifactSummary?.artifactBundleHttpUrl),
        artifactIndexUri: toStringValue(artifactSummary?.artifactIndexUri),
        artifactIndexHash: toStringValue(artifactSummary?.artifactIndexHash),
        artifactIndexHttpUrl: toStringValue(artifactSummary?.artifactIndexHttpUrl),
        whatWorkedWell: toStringValue(feedback?.whatWorkedWell),
        frictionFailures: toStringValue(feedback?.frictionFailures),
        recommendations: toStringValue(feedback?.recommendations),
        publishedArtifacts,
        phases,
        incidents
      };
    })
  );

  const incidents = incidentPage.records
    .map(normalizeIncident)
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));

  const latestPublishedAt = runs.reduce<string | null>((latest, run) => {
    if (!run.createdAt) return latest;
    if (!latest) return run.createdAt;
    return run.createdAt.localeCompare(latest) > 0 ? run.createdAt : latest;
  }, null);

  return {
    runtime,
    runs,
    incidents,
    latestPublishedAt
  };
}

export function deriveExecutionRecordHref(recordId: string): string {
  return `/BenchmarkRun/?mode=view&id=${encodeURIComponent(recordId)}`;
}

export function formatDuration(msString: string): string {
  const ms = Number(msString);
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function humanizeMode(mode: string): string {
  if (mode === 'fresh-follow-docs') return 'Fresh wallet benchmark';
  if (mode === 'inherited-key-follow-docs') return 'Inherited wallet benchmark';
  return mode;
}

export function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}

export function formatPhaseName(phase: string): string {
  return phase.replace(/[-_]+/g, ' ');
}

export function deriveExecutionInsights(
  run: BenchmarkExecutionRecord,
  options?: { deploymentAddress?: string | null; chainName?: string | null }
): BenchmarkExecutionInsights {
  const phases = sortByDisplayOrder(run.phases);
  const longestPhase = [...phases]
    .map((phase) => ({
      phase: phase.phase,
      durationMs: Number(phase.durationMs)
    }))
    .filter((phase) => Number.isFinite(phase.durationMs) && phase.durationMs >= 0)
    .sort((left, right) => right.durationMs - left.durationMs)[0] ?? null;

  const timing = {
    outerWallTimeMs: Number(run.outerWallTimeMs),
    outerWallTimeLabel: formatDuration(run.outerWallTimeMs),
    longestPhase: longestPhase
      ? {
          phase: longestPhase.phase,
          durationMs: longestPhase.durationMs,
          durationLabel: formatDuration(String(longestPhase.durationMs))
        }
      : null,
    phases: phases.map((phase) => ({
      phase: phase.phase,
      durationMs: Number(phase.durationMs),
      durationLabel: formatDuration(phase.durationMs),
      startedAt: phase.startedAt || null,
      endedAt: phase.endedAt || null
    }))
  };

  let headline = `Benchmark execution ${run.runId} ${run.status}`;
  if (run.status === 'success') {
    headline = `Benchmark execution succeeded using ${humanizeMode(run.mode).toLowerCase()} flow`;
  } else if (run.failurePhase) {
    headline = `Benchmark execution failed during ${run.failurePhase}`;
  }

  const fundingSummary =
    run.mode === 'inherited-key-follow-docs'
      ? 'reused a pre-funded inherited wallet'
      : run.fundingTxHash
        ? 'generated a wallet and acquired funds during the run'
        : run.walletAddress
          ? `used wallet ${run.walletAddress}`
          : 'wallet setup details were incomplete';

  const storageSummary =
    run.pieceCid && run.contentMatch
      ? `uploaded and downloaded content successfully with integrity verified for piece ${run.pieceCid}`
      : run.failurePhase
        ? `stopped during ${run.failurePhase}`
        : 'storage outcome was not fully captured';

  const artifactSummary =
    run.artifactIndexHttpUrl && run.artifactBundleHttpUrl
      ? 'published both the artifact index and full bundle to Filecoin Cloud retrieval URLs'
      : run.artifactBundleHttpUrl
        ? 'published the bundle to Filecoin Cloud but artifact indexing is incomplete'
        : 'artifact publication has not completed';

  const bullets = [
    `Credential strategy: ${humanizeMode(run.mode).toLowerCase()}; ${fundingSummary}.`,
    `Storage result: ${storageSummary}.`,
    `Artifacts: ${artifactSummary}.`,
    `Timing: total wall time ${timing.outerWallTimeLabel}${timing.longestPhase ? `; longest measured agent phase was ${timing.longestPhase.phase} at ${timing.longestPhase.durationLabel}` : ''}.`
  ];

  if (options?.deploymentAddress && run.recordId) {
    bullets.push(`Registry publication: published to ${options.chainName ?? 'the current chain'} at ${options.deploymentAddress} as BenchmarkRun record ${run.recordId}.`);
  }
  if (run.incidents.length > 0) {
    bullets.push(`Validator findings: ${run.incidents.map((incident) => `${incident.title}: ${incident.notes}`).join(' | ')}.`);
  }
  if (run.operatorNotes) {
    bullets.push(`Operator notes: ${run.operatorNotes}`);
  }

  return {
    headline,
    summary:
      run.status === 'success'
        ? 'This benchmark execution completed end to end and produced verifiable Filecoin-hosted evidence.'
        : 'This benchmark execution did not complete successfully; see the failure phase and evidence trail below.',
    bullets,
    timing
  };
}
