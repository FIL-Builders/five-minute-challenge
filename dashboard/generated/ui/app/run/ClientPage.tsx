'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchBenchmarkFeed, formatDuration, type BenchmarkRunFeedRecord } from '../../src/lib/feed';

function kv(label: string, value: string) {
  return (
    <>
      <div>{label}</div>
      <div>{value || 'n/a'}</div>
    </>
  );
}

export default function RunClientPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('id') ?? '';
  const [run, setRun] = useState<BenchmarkRunFeedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchBenchmarkFeed();
        const found = result.runs.find((entry) => entry.runId === runId) ?? null;
        if (!cancelled) {
          setRun(found);
          setError(found ? null : `Run not found in local feed: ${runId || 'missing id'}`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <div className="grid dashboardGrid">
      <div className="card span8">
        <div className="sectionRow">
          <div>
            <div className="eyebrow">Run detail</div>
            <h2>{run?.runId ?? 'Benchmark run'}</h2>
          </div>
          <Link className="btn" href="/">Back to overview</Link>
        </div>

        {error ? <div className="emptyState dangerBox">{error}</div> : null}
        {!run && !error ? <div className="emptyState">Loading run from local feed...</div> : null}

        {run ? (
          <>
            <div className="detailStrip">
              <div className="detailStat">
                <span className="statLabel">Status</span>
                <strong>{run.status}</strong>
              </div>
              <div className="detailStat">
                <span className="statLabel">Wall time</span>
                <strong>{formatDuration(run.outerWallTimeMs)}</strong>
              </div>
              <div className="detailStat">
                <span className="statLabel">Mode</span>
                <strong>{run.mode}</strong>
              </div>
            </div>
            <div className="kv detailKv">
              {kv('promptVersion', run.promptVersion)}
              {kv('model', run.model)}
              {kv('repoSha', run.repoSha)}
              {kv('startedAt', run.startedAt)}
              {kv('endedAt', run.endedAt)}
              {kv('failurePhase', run.failurePhase)}
              {kv('walletAddress', run.walletAddress)}
              {kv('fundingTxHash', run.fundingTxHash)}
              {kv('depositTxHash', run.depositTxHash)}
              {kv('pieceCid', run.pieceCid)}
              {kv('docsSnapshotHash', run.docsSnapshotHash)}
              {kv('artifactBundleUri', run.artifactBundleUri)}
              {kv('artifactBundleHttpUrl', run.artifactBundleHttpUrl)}
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <h2>Artifacts</h2>
              <div className="muted">Local run evidence and published bundle retrieval links.</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                {(run.meta?.localArtifacts ?? []).map((artifact) => (
                  artifact.url ? (
                    <a key={`${artifact.label}-${artifact.path}`} className="btn" href={artifact.url} target="_blank" rel="noreferrer">
                      {artifact.label}
                    </a>
                  ) : null
                ))}
                {run.artifactBundleHttpUrl ? (
                  <a className="btn primary" href={run.artifactBundleHttpUrl} target="_blank" rel="noreferrer">
                    Artifact bundle
                  </a>
                ) : null}
              </div>
            </div>

            {run.meta?.dashboardPublish ? (
              <div className="card" style={{ marginTop: 20 }}>
                <h2>Registry</h2>
                <div className="muted">Chain-backed BenchmarkRun registry publication metadata.</div>
                <div className="kv detailKv" style={{ marginTop: 16 }}>
                  {kv('publishedAt', run.meta.dashboardPublish.publishedAt ?? '')}
                  {kv('chainName', run.meta.dashboardPublish.chainName ?? '')}
                  {kv('deploymentAddress', run.meta.dashboardPublish.deploymentAddress ?? '')}
                  {kv('runRecordId', run.meta.dashboardPublish.runRecordId ?? '')}
                </div>
                {run.meta.dashboardPublish.runRecordHref ? (
                  <div style={{ marginTop: 16 }}>
                    <Link className="btn" href={run.meta.dashboardPublish.runRecordHref}>Open on-chain record</Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="card span4">
        <h2>Operator notes</h2>
        <div className="muted">Validator findings and retained run commentary.</div>
        <div className="notesPanel">{run?.operatorNotes || 'No operator notes for this run.'}</div>
      </div>
    </div>
  );
}
