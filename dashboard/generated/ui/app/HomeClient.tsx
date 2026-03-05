'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  fetchBenchmarkFeed,
  formatDuration,
  percentile,
  type BenchmarkIncidentRecord,
  type BenchmarkRunRecord
} from '../src/lib/feed';

type FeedState = {
  runs: BenchmarkRunRecord[];
  incidents: BenchmarkIncidentRecord[];
  generatedAt: string | null;
};

function summarize(runs: BenchmarkRunRecord[]) {
  const samples = runs
    .map((run) => Number(run.outerWallTimeMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const successCount = runs.filter((run) => run.status === 'success').length;
  return {
    total: runs.length,
    successRate: runs.length ? Math.round((successCount / runs.length) * 100) : 0,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95)
  };
}

function tone(status: string): string {
  if (status === 'success') return 'toneSuccess';
  if (status === 'invalid') return 'toneWarn';
  return 'toneDanger';
}

export default function HomeClient() {
  const [state, setState] = useState<FeedState>({ runs: [], incidents: [], generatedAt: null });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchBenchmarkFeed();
        if (!cancelled) {
          setState({ runs: result.runs, incidents: result.incidents, generatedAt: result.feed.generatedAt });
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
  }, []);

  const latestRuns = [...state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12);
  const openIncidents = state.incidents.filter((incident) => incident.status === 'open').slice(0, 8);
  const metrics = summarize(state.runs);

  return (
    <>
      <div className="heroPanel">
        <div>
          <span className="eyebrow">Filecoin Cloud Benchmark</span>
          <h2 className="heroTitle">Run history, failures, and latency trends from local harness evidence.</h2>
          <p className="heroLead">
            This dashboard reads a local benchmark feed built from validated runs so the UI reflects actual benchmark artifacts.
          </p>
        </div>
        <div className="heroMeta">
          <div className="heroMetaItem">
            <span className="heroMetaLabel">Feed generated</span>
            <strong>{state.generatedAt ?? 'not built yet'}</strong>
          </div>
          <div className="heroMetaItem">
            <span className="heroMetaLabel">Open incidents</span>
            <strong>{openIncidents.length}</strong>
          </div>
        </div>
      </div>

      <div className="grid metricsGrid">
        <div className="card statCard">
          <span className="statLabel">Total runs</span>
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

      <div className="grid dashboardGrid">
        <div className="card span8">
          <div className="sectionRow">
            <div>
              <h2>Recent runs</h2>
              <div className="muted">Latest benchmark output derived from local `runs/` artifacts.</div>
            </div>
          </div>

          {loading ? <div className="emptyState">Loading benchmark feed...</div> : null}
          {error ? <div className="emptyState dangerBox">{error}</div> : null}
          {!loading && !error && latestRuns.length === 0 ? <div className="emptyState">No runs found yet. Run a benchmark and rebuild the feed.</div> : null}

          <div className="runTable">
            {latestRuns.map((run) => (
              <div key={run.runId} className="runRow">
                <div>
                  <div className="runPrimary">
                    <Link className="runLink" href={`/run?id=${encodeURIComponent(run.runId)}`}>
                      {run.runId}
                    </Link>
                    <span className={`statusPill ${tone(run.status)}`}>{run.status}</span>
                  </div>
                  <div className="runSecondary">
                    <span>{run.mode}</span>
                    <span>{run.promptVersion}</span>
                    <span>{run.model}</span>
                  </div>
                </div>
                <div className="runStats">
                  <span>{formatDuration(run.outerWallTimeMs)}</span>
                  <span>{run.failurePhase || 'ok'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card span4">
          <h2>Open incidents</h2>
          <div className="muted">Validator findings turned into operator-facing records.</div>
          <div className="incidentList">
            {openIncidents.map((incident) => (
              <div key={`${incident.runId}-${incident.title}`} className="incidentItem">
                <div className="incidentTitle">{incident.title}</div>
                <div className="incidentMeta">{incident.openedAt}</div>
                <div className="incidentNotes">{incident.notes}</div>
              </div>
            ))}
            {!loading && !error && openIncidents.length === 0 ? <div className="emptyState">No open incidents in the local feed.</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}
