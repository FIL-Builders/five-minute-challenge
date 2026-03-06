import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkRunLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkRun">{props.children}</CollectionLayout>;
}
