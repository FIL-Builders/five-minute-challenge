'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchBenchmarkFeed, formatDuration, type BenchmarkRunRecord } from '../../src/lib/feed';

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
  const [run, setRun] = useState<BenchmarkRunRecord | null>(null);
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
            </div>
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
