import { Suspense } from 'react';

import BenchmarkRunPageClient from './BenchmarkRunPageClient';

export default function BenchmarkRunPage() {
  return (
    <Suspense fallback={<div className="card">Loading BenchmarkRun...</div>}>
      <BenchmarkRunPageClient />
    </Suspense>
  );
}
