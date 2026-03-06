import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkArtifactsLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkArtifacts">{props.children}</CollectionLayout>;
}
