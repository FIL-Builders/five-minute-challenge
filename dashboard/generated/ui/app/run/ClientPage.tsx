'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  deriveExecutionInsights,
  deriveExecutionRecordHref,
  formatDuration,
  formatPhaseName,
  humanizeMode,
  loadBenchmarkDashboardSnapshot,
  type ArtifactLink,
  type BenchmarkExecutionRecord
} from '../../src/lib/dashboard';
import { formatDateTime } from '../../src/lib/format';

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

export default function RunClientPage(props: { showRegistryLink?: boolean }) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('id') ?? '';
  const rpcOverride = searchParams.get('rpc') ?? undefined;
  const [run, setRun] = useState<BenchmarkExecutionRecord | null>(null);
  const [deploymentAddress, setDeploymentAddress] = useState<string | null>(null);
  const [chainName, setChainName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactPreviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await loadBenchmarkDashboardSnapshot(rpcOverride);
        const found =
          result.runs.find((entry) => entry.runId === requestedId || entry.recordId === requestedId) ?? null;
        if (!cancelled) {
          setRun(found);
          setDeploymentAddress(result.runtime.deployment?.deploymentEntrypointAddress ?? null);
          setChainName(result.runtime.deployment?.chainName ?? result.runtime.chain?.name ?? null);
          setError(found ? null : `Benchmark execution not found on the current deployment: ${requestedId || 'missing id'}`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedId, rpcOverride]);

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
      error: artifact.url ? null : 'Artifact does not have an HTTP retrieval URL.'
    });
  }

  const insights = useMemo(
    () => (run ? deriveExecutionInsights(run, { deploymentAddress, chainName }) : null),
    [chainName, deploymentAddress, run]
  );
  const timing = insights?.timing ?? null;
  const pageTitle = run?.startedAt ? formatDateTime(run.startedAt, 'compact') : run?.runId ?? 'Benchmark execution';

  return (
    <>
      <div className="runPage">
        <div className="pageHeader">
          <div>
            <div className="eyebrow">Benchmark execution detail</div>
            <h1 className="pageTitle">{pageTitle}</h1>
            {run?.runId ? <div className="heroRailCode">{run.runId}</div> : null}
            <p className="pageLead">
              This page describes one measured execution of the benchmark. The chain-backed <code>BenchmarkRun</code> record is the registry entry;
              this page is the human-readable execution view built from that record plus Filecoin-hosted evidence.
            </p>
          </div>
          <div className="pageActions">
            <Link className="btn" href="/">Back to overview</Link>
            {props.showRegistryLink !== false && run?.recordId ? (
              <Link className="btn" href={deriveExecutionRecordHref(run.recordId)}>Open registry record</Link>
            ) : null}
          </div>
        </div>

        {error ? <div className="emptyState dangerBox">{error}</div> : null}
        {!run && !error ? <div className="emptyState">Loading benchmark execution from on-chain records...</div> : null}

        {run ? (
          <>
            <section className="runHeroCard">
              <div>
                <span className="eyebrow">Execution verdict</span>
                <h2>{insights?.headline ?? `Benchmark execution ${run.status}`}</h2>
                <p className="runHeroLead">
                  {insights?.summary ?? 'This execution has not been summarized yet.'}
                </p>
              </div>
              <div className="runHeroMetrics">
                <div className="heroRailCard">
                  <span className="heroMetaLabel">Status</span>
                  <strong>{run.status}</strong>
                </div>
                <div className="heroRailCard">
                  <span className="heroMetaLabel">Mode</span>
                  <strong>{humanizeMode(run.mode)}</strong>
                </div>
                <div className="heroRailCard">
                  <span className="heroMetaLabel">Wall time</span>
                  <strong>{formatDuration(run.outerWallTimeMs)}</strong>
                </div>
              </div>
            </section>

            <div className="runContentGrid">
              <section className="card">
                <h2>Execution summary</h2>
                <div className="muted">
                  Derived feedback for this benchmark execution, computed from chain-backed registry records and Filecoin-hosted evidence references.
                </div>
                <div className="summaryBulletList">
                  {(insights?.bullets ?? []).map((bullet, index) => (
                    <div key={`${run.runId}-bullet-${index}`} className="summaryBullet">
                      {bullet}
                    </div>
                  ))}
                  {(insights?.bullets ?? []).length === 0 ? (
                    <div className="emptyState">No derived insights are available yet.</div>
                  ) : null}
                </div>
              </section>

              <section className="card sectionCard">
                <h2>Execution metadata</h2>
                <div className="kv detailKv">
                  {kv('model', run.model)}
                  {kv('promptVersion', run.promptVersion)}
                  {kv('repoSha', run.repoSha)}
                  {kv('startedAt', formatDateTime(run.startedAt))}
                  {kv('endedAt', formatDateTime(run.endedAt))}
                  {kv('failurePhase', run.failurePhase)}
                  {kv('walletAddress', run.walletAddress)}
                  {kv('fundingTxHash', run.fundingTxHash)}
                  {kv('depositTxHash', run.depositTxHash)}
                  {kv('docsSnapshotHash', run.docsSnapshotHash)}
                </div>
              </section>

              <section className="card sectionCard">
                <h2>SDK and onboarding feedback</h2>
                <div className="muted">
                  These three text sections are stored on-chain in the benchmark registry as a dedicated feedback record keyed by <code>runId</code>, and they mirror the benchmark report structure.
                </div>
                <div className="feedbackSectionList">
                  <div className="feedbackSectionCard">
                    <span className="statLabel">What Worked Well</span>
                    <div className="notesPanel feedbackPanel">{run.whatWorkedWell || 'No on-chain “what worked well” feedback was recorded for this execution.'}</div>
                  </div>
                  <div className="feedbackSectionCard">
                    <span className="statLabel">Friction / Failures</span>
                    <div className="notesPanel feedbackPanel">{run.frictionFailures || 'No on-chain friction or failure notes were recorded for this execution.'}</div>
                  </div>
                  <div className="feedbackSectionCard">
                    <span className="statLabel">Recommendations</span>
                    <div className="notesPanel feedbackPanel">{run.recommendations || 'No on-chain recommendations were recorded for this execution.'}</div>
                  </div>
                </div>
              </section>

              <section className="card sectionCard">
                <h2>Evidence and artifacts</h2>
                <div className="muted">
                  All linked evidence below is stored on Filecoin Onchain Cloud retrieval URLs rather than localhost.
                </div>
                <div className="artifactGrid artifactGridReadable">
                  {run.publishedArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactKey}
                      className="btn artifactButton"
                      type="button"
                      onClick={() => openArtifactPreview(artifact)}
                    >
                      {artifact.label}
                    </button>
                  ))}
                </div>
                <div className="kv detailKv">
                  {kv('pieceCid', run.pieceCid)}
                  {kv('contentMatch', run.contentMatch ? 'verified' : 'not verified')}
                  {kv('artifactIndex', run.artifactIndexHttpUrl)}
                  {kv('artifactBundle', run.artifactBundleHttpUrl)}
                </div>
              </section>

              <section className="card sectionCard">
                <h2>Phase timing</h2>
                <div className="muted">
                  End-to-end wall time includes model inference and harness overhead. Per-phase timing is agent-reported and shown as supporting detail.
                </div>
                <div className="timingHeader">
                  <div className="detailStat">
                    <span className="statLabel">Total wall time</span>
                    <strong>{timing?.outerWallTimeLabel ?? formatDuration(run.outerWallTimeMs)}</strong>
                  </div>
                  <div className="detailStat">
                    <span className="statLabel">Longest agent phase</span>
                    <strong>{timing?.longestPhase ? `${formatPhaseName(timing.longestPhase.phase)} · ${timing.longestPhase.durationLabel}` : 'n/a'}</strong>
                  </div>
                </div>
                <div className="phaseList">
                  {(timing?.phases ?? []).map((phase) => (
                    <div key={`${run.runId}-${phase.phase}-${phase.startedAt ?? 'na'}`} className="phaseRow">
                      <div>
                        <div className="phaseTitle">{formatPhaseName(phase.phase)}</div>
                        <div className="phaseMeta">
                          <span>{phase.startedAt ? formatDateTime(phase.startedAt) : 'n/a'}</span>
                          <span>{phase.endedAt ? formatDateTime(phase.endedAt) : 'n/a'}</span>
                        </div>
                      </div>
                      <div className="phaseDuration">{phase.durationLabel}</div>
                    </div>
                  ))}
                  {(timing?.phases ?? []).length === 0 ? <div className="emptyState">No per-phase timing was captured for this execution.</div> : null}
                </div>
              </section>

              <section className="card sectionCard">
                <h2>Registry publication</h2>
                <div className="muted">
                  This section is derived live from the current Token Host deployment plus the on-chain <code>BenchmarkRun</code> record.
                </div>
                <div className="kv detailKv">
                  {kv('chainName', chainName ?? '')}
                  {kv('deploymentAddress', deploymentAddress ?? '')}
                  {kv('runRecordId', run.recordId)}
                  {kv('publishedAt', run.createdAt ? formatDateTime(run.createdAt) : '')}
                  {kv('registryStatus', run.recordId ? 'published' : '')}
                </div>
              </section>

              <section className="card sectionCard">
                <h2>Operator notes</h2>
                <div className="muted">Raw retained notes from validation and artifact publication.</div>
                <div className="notesPanel">{run.operatorNotes || 'No operator notes for this execution.'}</div>
              </section>
            </div>
          </>
        ) : null}
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
