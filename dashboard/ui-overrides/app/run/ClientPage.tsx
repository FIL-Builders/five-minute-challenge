'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchBenchmarkFeed, formatDuration, type ArtifactLink, type BenchmarkRunFeedRecord } from '../../src/lib/feed';

function kv(label: string, value: string) {
  return (
    <>
      <div>{label}</div>
      <div>{value || 'n/a'}</div>
    </>
  );
}

type ArtifactPreviewState = {
  artifact: ArtifactLink;
  mode: 'text' | 'binary';
  content: string | null;
  loading: boolean;
  error: string | null;
};

function previewModeForArtifact(artifact: ArtifactLink): 'text' | 'binary' {
  const lowerPath = String(artifact.path || '').toLowerCase();
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.log') ||
    lowerPath.endsWith('.txt') ||
    lowerPath.endsWith('.md') ||
    lowerPath.endsWith('.html') ||
    lowerPath.endsWith('.htm')
  ) {
    return 'text';
  }
  return 'binary';
}

function normalizeArtifactText(artifact: ArtifactLink, raw: string): string {
  if (String(artifact.path || '').toLowerCase().endsWith('.json')) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

export default function RunClientPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('id') ?? '';
  const [run, setRun] = useState<BenchmarkRunFeedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactPreviewState | null>(null);

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

  useEffect(() => {
    if (!preview || preview.mode !== 'text' || !preview.artifact.url) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(preview.artifact.url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load artifact: ${response.status}`);
        }
        const raw = await response.text();
        if (!cancelled) {
          setPreview((current) =>
            current && current.artifact.path === preview.artifact.path
              ? {
                  ...current,
                  loading: false,
                  content: normalizeArtifactText(preview.artifact, raw),
                  error: null
                }
              : current
          );
        }
      } catch (err) {
        if (!cancelled) {
          setPreview((current) =>
            current && current.artifact.path === preview.artifact.path
              ? {
                  ...current,
                  loading: false,
                  content: null,
                  error: err instanceof Error ? err.message : String(err)
                }
              : current
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  function openArtifactPreview(artifact: ArtifactLink) {
    const mode = previewModeForArtifact(artifact);
    setPreview({
      artifact,
      mode,
      content: null,
      loading: mode === 'text',
      error: artifact.url ? null : 'Artifact does not have an HTTP retrieval URL.',
    });
  }

  return (
    <>
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
                {kv('artifactIndexUri', run.artifactIndexUri)}
                {kv('artifactIndexHttpUrl', run.artifactIndexHttpUrl)}
              </div>

              <div className="card" style={{ marginTop: 20 }}>
                <h2>Artifacts</h2>
                <div className="muted">Filecoin-hosted run evidence, artifact index, and bundle retrieval links.</div>
                <div className="artifactGrid">
                  {(run.meta?.publishedArtifacts ?? []).map((artifact) => (
                    <button
                      key={`${artifact.label}-${artifact.path}`}
                      className="btn artifactButton"
                      type="button"
                      onClick={() => openArtifactPreview(artifact)}
                    >
                      {artifact.label}
                    </button>
                  ))}
                </div>
              </div>

              {run.meta?.dashboardPublish ? (
                <div className="card" style={{ marginTop: 20 }}>
                  <h2>Registry</h2>
                  <div className="muted">Chain-backed BenchmarkRun registry publication metadata.</div>
                  <div className="kv detailKv" style={{ marginTop: 16 }}>
                    {kv('status', run.meta.dashboardPublish.status ?? '')}
                    {kv('attemptedAt', run.meta.dashboardPublish.attemptedAt ?? '')}
                    {kv('publishedAt', run.meta.dashboardPublish.publishedAt ?? '')}
                    {kv('chainName', run.meta.dashboardPublish.chainName ?? '')}
                    {kv('deploymentAddress', run.meta.dashboardPublish.deploymentAddress ?? '')}
                    {kv('runRecordId', run.meta.dashboardPublish.runRecordId ?? '')}
                  </div>
                  {run.meta.dashboardPublish.error ? (
                    <div className="notesPanel" style={{ marginTop: 16 }}>{run.meta.dashboardPublish.error}</div>
                  ) : null}
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

      {preview ? (
        <div className="artifactModalOverlay" role="presentation" onClick={() => setPreview(null)}>
          <div className="artifactModal" role="dialog" aria-modal="true" aria-labelledby="artifact-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="artifactModalHeader">
              <div>
                <div className="eyebrow">Artifact</div>
                <h2 id="artifact-modal-title">{preview.artifact.label}</h2>
              </div>
              <button className="btn artifactModalClose" type="button" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="artifactMeta">
              {kv('path', preview.artifact.path)}
              {kv('uri', preview.artifact.uri ?? '')}
              {kv('hash', preview.artifact.hash ?? '')}
            </div>
            <div className="artifactActions">
              {preview.artifact.url ? (
                <a className="btn" href={preview.artifact.url} target="_blank" rel="noreferrer">
                  Open raw artifact
                </a>
              ) : null}
            </div>
            <div className="artifactModalBody">
              {preview.error ? <div className="emptyState dangerBox">{preview.error}</div> : null}
              {!preview.error && preview.mode === 'binary' ? (
                <div className="emptyState">
                  Inline preview is not available for this artifact type. Use the raw artifact link above.
                </div>
              ) : null}
              {!preview.error && preview.mode === 'text' && preview.loading ? (
                <div className="emptyState">Loading artifact from Filecoin retrieval URL...</div>
              ) : null}
              {!preview.error && preview.mode === 'text' && !preview.loading ? (
                <pre className="artifactPreview">{preview.content || 'Artifact was empty.'}</pre>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
