export type ArtifactLink = {
  label: string;
  path: string;
  url: string | null;
};

export type DashboardPublishMeta = {
  status: string;
  attemptedAt: string | null;
  publishedAt: string | null;
  chainName: string | null;
  deploymentAddress: string | null;
  runRecordId: string | null;
  runRecordHref: string | null;
  incidentRecordIds: string[];
  incidentRecordHrefs: string[];
  error: string | null;
} | null;

export type BenchmarkRunMeta = {
  source: {
    runSummaryPath: string;
    validationResultPath: string;
    dashboardRecordsPath: string;
    artifactPublishResultPath: string | null;
    dashboardPublishResultPath?: string | null;
  };
  localArtifacts: ArtifactLink[];
  validation: {
    status: string | null;
    failurePhase: string | null;
    schemaValid: boolean | null;
  };
  externalArtifacts: {
    artifactBundleUri: string | null;
    artifactBundleHash: string | null;
    artifactBundleHttpUrl: string | null;
  };
  dashboardPublish: DashboardPublishMeta;
};

export type BenchmarkRunRecord = {
  runId: string;
  mode: string;
  promptVersion: string;
  model: string;
  repoSha: string;
  docsUrl: string;
  docsSnapshotHash: string;
  status: string;
  failurePhase: string;
  startedAt: string;
  endedAt: string;
  outerWallTimeMs: string;
  walletAddress: string;
  fundingTxHash: string;
  depositTxHash: string;
  pieceCid: string;
  contentMatch: boolean;
  artifactBundleUri: string;
  artifactBundleHash: string;
  artifactBundleHttpUrl: string;
  operatorNotes: string;
};

export type BenchmarkRunFeedRecord = BenchmarkRunRecord & {
  meta?: BenchmarkRunMeta;
};

export type BenchmarkIncidentRecord = {
  runId: string;
  severity: string;
  title: string;
  status: string;
  openedAt: string;
  closedAt: string;
  notes: string;
};

type FeedRecord = {
  collection: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type BenchmarkFeed = {
  generatedAt: string | null;
  runCount: number;
  incidentCount: number;
  runs: FeedRecord[];
  incidents: FeedRecord[];
};

export async function fetchBenchmarkFeed(): Promise<{
  feed: BenchmarkFeed;
  runs: BenchmarkRunFeedRecord[];
  incidents: BenchmarkIncidentRecord[];
}> {
  const response = await fetch('/benchmark-feed.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load benchmark feed: ${response.status}`);
  }
  const feed = (await response.json()) as BenchmarkFeed;
  const runs = Array.isArray(feed.runs)
    ? feed.runs.map((record) => ({
        ...(record.data as BenchmarkRunRecord),
        meta: record.meta as BenchmarkRunMeta | undefined
      }))
    : [];
  const incidents = Array.isArray(feed.incidents)
    ? feed.incidents.map((record) => record.data as BenchmarkIncidentRecord)
    : [];
  return { feed, runs, incidents };
}

export function formatDuration(msString: string): string {
  const ms = Number(msString);
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}
