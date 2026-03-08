'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkRunLayoutClient(props: { children: ReactNode }) {
  const search = useSearchParams();
  const mode = search.get('mode') ?? 'list';
  const id = search.get('id') ?? '';

  if (mode === 'view' && id) {
    return <>{props.children}</>;
  }

  return <CollectionLayout collectionName="BenchmarkRun">{props.children}</CollectionLayout>;
}
