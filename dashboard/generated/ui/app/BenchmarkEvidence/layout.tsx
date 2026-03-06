import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkEvidenceLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkEvidence">{props.children}</CollectionLayout>;
}
