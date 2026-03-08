'use client';

import { useSearchParams } from 'next/navigation';

import CollectionPage from '../[collection]/ClientPage';
import RunClientPage from '../run/ClientPage';

export default function BenchmarkRunPageClient() {
  const search = useSearchParams();
  const mode = search.get('mode') ?? 'list';
  const id = search.get('id') ?? '';

  if (mode === 'view' && id) {
    return <RunClientPage showRegistryLink={false} />;
  }

  return <CollectionPage params={{ collection: 'BenchmarkRun' }} />;
}
