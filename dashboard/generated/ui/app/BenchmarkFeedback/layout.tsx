import type { ReactNode } from 'react';

import CollectionLayout from '../../src/collection-route/CollectionLayout';

export default function BenchmarkFeedbackLayout(props: { children: ReactNode }) {
  return <CollectionLayout collectionName="BenchmarkFeedback">{props.children}</CollectionLayout>;
}
