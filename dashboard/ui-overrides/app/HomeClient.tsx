'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  deriveExecutionRecordHref,
  deriveExecutionInsights,
  formatDuration,
  humanizeMode,
  loadBenchmarkDashboardSnapshot,
  percentile,
  type BenchmarkIncidentRecord,
  type BenchmarkExecutionRecord
} from '../src/lib/dashboard';
import { formatDateTime } from '../src/lib/format';

type DashboardState = {
  runs: BenchmarkExecutionRecord[];
  incidents: BenchmarkIncidentRecord[];
  latestPublishedAt: string | null;
  deploymentAddress: string | null;
  chainName: string | null;
};

function summarize(runs: BenchmarkExecutionRecord[]) {
  const samples = runs
    .map((run) => Number(run.outerWallTimeMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const successCount = runs.filter((run) => run.status === 'success').length;
  const freshWalletRuns = runs.filter((run) => run.mode === 'fresh-follow-docs').length;
  const inheritedRuns = runs.filter((run) => run.mode === 'inherited-key-follow-docs').length;
  return {
    total: runs.length,
    successRate: runs.length ? Math.round((successCount / runs.length) * 100) : 0,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    freshWalletRuns,
    inheritedRuns
  };
}

function tone(status: string): string {
  if (status === 'success') return 'toneSuccess';
  if (status === 'invalid') return 'toneWarn';
  return 'toneDanger';
}

export default function HomeClient() {
  const search = useSearchParams();
  const rpcOverride = search.get('rpc') ?? undefined;
  const [state, setState] = useState<DashboardState>({
    runs: [],
    incidents: [],
    latestPublishedAt: null,
    deploymentAddress: null,
    chainName: null
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await loadBenchmarkDashboardSnapshot(rpcOverride);
        if (!cancelled) {
          setState({
            runs: result.runs,
            incidents: result.incidents,
            latestPublishedAt: result.latestPublishedAt,
            deploymentAddress: result.runtime.deployment?.deploymentEntrypointAddress ?? null,
            chainName: result.runtime.deployment?.chainName ?? result.runtime.chain?.name ?? null
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpcOverride]);

  const latestRuns = useMemo(
    () => [...state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12),
    [state.runs]
  );
  const openIncidents = useMemo(
    () => state.incidents.filter((incident) => incident.status === 'open').slice(0, 8),
    [state.incidents]
  );
  const metrics = summarize(state.runs);
  const latestRun = latestRuns[0] ?? null;

  return (
    <>
      <section className="heroPanel heroPanelNew">
        <div className="heroCopy">
          <span className="eyebrow">Five Minute Challenge</span>
          <h1 className="heroTitle">A live benchmark registry for agents attempting the Filecoin Cloud getting-started flow.</h1>
          <p className="heroLead">
            Each benchmark execution measures whether an agent can follow the Filecoin Cloud guide, fund or reuse the required wallet path,
            upload a payload, download it again, and publish verifiable evidence. This dashboard is the operator view over those benchmark executions.
          </p>
          <div className="heroCallout">
            <strong>Where the dynamic data lives</strong>
            <p>
              Benchmark status and registry records are published on Filecoin Calibration. Evidence bundles, logs, reports, payloads, and artifact
              indexes are published to Filecoin Onchain Cloud retrieval URLs. This UI is generated with the Token Host framework and then extended
              with benchmark-specific views.
            </p>
            <p>
              Read-only browsing does not require MetaMask and does not require the wallet to be on Calibration. The dashboard reads chain state
              through public Calibration RPC; wallet connection is only needed for write actions in the generic registry views.
            </p>
          </div>
          <div className="heroActions">
            <Link className="btn" href={latestRun?.recordId ? deriveExecutionRecordHref(latestRun.recordId) : '/BenchmarkRun'}>
              {latestRun ? 'Open latest benchmark execution' : 'Open benchmark registry'}
            </Link>
            <a className="btn" href="https://github.com/tokenhost/tokenhost-builder/" target="_blank" rel="noreferrer">
              Token Host framework
            </a>
            <Link className="btn" href="/BenchmarkRun">
              Chain-backed registry view
            </Link>
          </div>
        </div>

        <div className="heroRail">
          <div className="heroRailCard">
            <span className="heroMetaLabel">Latest registry publish</span>
            <strong className="heroRailValue">{state.latestPublishedAt ? formatDateTime(state.latestPublishedAt, 'compact') : 'nothing published yet'}</strong>
            <div className="muted">{state.chainName ?? 'Chain metadata unavailable.'}</div>
          </div>
          <div className="heroRailCard">
            <span className="heroMetaLabel">Latest benchmark execution</span>
            <strong className="heroRailValue">{latestRun?.startedAt ? formatDateTime(latestRun.startedAt, 'compact') : 'none yet'}</strong>
            {latestRun ? <div className="heroRailCode">{latestRun.runId}</div> : null}
            <div className="muted">{latestRun ? humanizeMode(latestRun.mode) : 'No on-chain benchmark executions yet.'}</div>
          </div>
          <div className="heroRailCard">
            <span className="heroMetaLabel">Open incidents</span>
            <strong className="heroRailValue">{openIncidents.length}</strong>
            <div className="muted">Validator findings requiring operator review.</div>
          </div>
        </div>
      </section>

      <section className="architectureGrid">
        <div className="card architectureCard">
          <span className="sectionLabel">Control plane</span>
          <h2>Benchmark harness</h2>
          <p>
            The local runner launches a benchmark execution, measures full wall time, validates artifacts, and publishes a normalized result.
          </p>
        </div>
        <div className="card architectureCard">
          <span className="sectionLabel">Registry</span>
          <h2>Calibration records</h2>
          <p>
            The on-chain <code>BenchmarkRun</code> collection is the registry record. On this page, we call each observed attempt a
            <strong> benchmark execution</strong> to avoid mixing the runtime event with the on-chain collection name.
          </p>
        </div>
        <div className="card architectureCard">
          <span className="sectionLabel">Evidence</span>
          <h2>Filecoin-hosted artifacts</h2>
          <p>
            Reports, logs, payloads, validation output, docs snapshots, and bundles are stored on Filecoin Onchain Cloud and linked directly from each execution page.
          </p>
        </div>
      </section>

      <div className="grid metricsGrid">
        <div className="card statCard">
          <span className="statLabel">Benchmark executions</span>
          <div className="statValue">{metrics.total}</div>
        </div>
        <div className="card statCard">
          <span className="statLabel">Success rate</span>
          <div className="statValue">{metrics.successRate}%</div>
        </div>
        <div className="card statCard">
          <span className="statLabel">p50 wall time</span>
          <div className="statValue">{metrics.p50 === null ? 'n/a' : formatDuration(String(metrics.p50))}</div>
        </div>
        <div className="card statCard">
          <span className="statLabel">p95 wall time</span>
          <div className="statValue">{metrics.p95 === null ? 'n/a' : formatDuration(String(metrics.p95))}</div>
        </div>
      </div>

      <section className="modeStrip">
        <div className="modeCard">
          <span className="statLabel">Fresh wallet mode</span>
          <strong>{metrics.freshWalletRuns}</strong>
          <div className="muted">The agent must generate and fund its own wallet through documented public flows.</div>
        </div>
        <div className="modeCard">
          <span className="statLabel">Inherited wallet mode</span>
          <strong>{metrics.inheritedRuns}</strong>
          <div className="muted">The agent inherits a funded key and is measured on the storage path rather than faucet acquisition.</div>
        </div>
      </section>

      <div className="grid dashboardGrid">
        <div className="card span8">
          <div className="sectionRow">
            <div>
              <h2>Recent benchmark executions</h2>
              <div className="muted">
                Each row is one measured execution of the benchmark. The chain-backed registry view is available separately as the raw
                <code> BenchmarkRun</code> collection.
              </div>
            </div>
          </div>

          {loading ? <div className="emptyState">Loading on-chain benchmark registry...</div> : null}
          {error ? <div className="emptyState dangerBox">{error}</div> : null}
          {!loading && !error && latestRuns.length === 0 ? <div className="emptyState">No benchmark executions found yet on the current deployment.</div> : null}

          <div className="runTable runTableDetailed">
            {latestRuns.map((run) => (
              <div key={run.runId} className="runRow runRowDetailed">
                <div className="runPrimaryBlock">
                  <div className="runPrimary">
                    <Link className="runLink" href={run.recordId ? deriveExecutionRecordHref(run.recordId) : `/run/?id=${encodeURIComponent(run.runId)}`}>
                      {run.runId}
                    </Link>
                    <span className={`statusPill ${tone(run.status)}`}>{run.status}</span>
                  </div>
                  <div className="runSecondary">
                    <span>{humanizeMode(run.mode)}</span>
                    <span>{run.model}</span>
                    <span>{run.promptVersion}</span>
                  </div>
                  <div className="runInsightLine">
                    {deriveExecutionInsights(run, {
                      deploymentAddress: state.deploymentAddress,
                      chainName: state.chainName
                    }).headline}
                  </div>
                </div>
                <div className="runStats runStatsDetailed">
                  <span>{formatDuration(run.outerWallTimeMs)}</span>
                  <span>{run.failurePhase || 'completed'}</span>
                  <span>{run.contentMatch ? 'verified' : 'not verified'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card span4">
          <h2>Open incidents</h2>
          <div className="muted">Validator findings promoted into operator-facing alerts.</div>
          <div className="incidentList">
            {openIncidents.map((incident) => (
              <div key={`${incident.runId}-${incident.title}`} className="incidentItem">
                <div className="incidentTitle">{incident.title}</div>
                <div className="incidentMeta">{formatDateTime(incident.openedAt)}</div>
                <div className="incidentNotes">{incident.notes}</div>
              </div>
            ))}
            {!loading && !error && openIncidents.length === 0 ? <div className="emptyState">No open incidents in the current deployment.</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}
