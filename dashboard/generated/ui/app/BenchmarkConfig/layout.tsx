import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkConfigLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkConfig">{props.children}</CollectionLayout>;
}
