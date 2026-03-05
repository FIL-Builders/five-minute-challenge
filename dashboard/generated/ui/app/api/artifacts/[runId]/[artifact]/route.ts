import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith('.json')) return 'application/json; charset=utf-8';
  if (fileName.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (fileName.endsWith('.txt') || fileName.endsWith('.log')) return 'text/plain; charset=utf-8';
  if (fileName.endsWith('.tgz') || fileName.endsWith('.gz')) return 'application/gzip';
  return 'application/octet-stream';
}

export async function GET(_: Request, context: { params: { runId: string; artifact: string } }) {
  const runId = String(context.params.runId ?? '');
  const artifact = String(context.params.artifact ?? '');

  if (!isSafeSegment(runId) || !isSafeSegment(artifact)) {
    return new Response('Invalid artifact path.', { status: 400 });
  }

  const repoRoot = path.resolve(process.cwd(), '../../..');
  const runDir = path.join(repoRoot, 'runs', runId);
  const filePath = path.join(runDir, artifact);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(`${runDir}${path.sep}`) && resolved !== runDir) {
    return new Response('Artifact path rejected.', { status: 400 });
  }

  try {
    const data = await readFile(resolved);
    return new Response(data, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(artifact),
        'cache-control': 'no-store'
      }
    });
  } catch {
    return new Response('Artifact not found.', { status: 404 });
  }
}
