import type { ReactNode } from 'react';
import { Suspense } from 'react';

import BenchmarkRunLayoutClient from './BenchmarkRunLayoutClient';

export default function BenchmarkRunLayout(props: { children: ReactNode }) {
  return (
    <Suspense fallback={<>{props.children}</>}>
      <BenchmarkRunLayoutClient>{props.children}</BenchmarkRunLayoutClient>
    </Suspense>
  );
}
