import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkIncidentLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkIncident">{props.children}</CollectionLayout>;
}
