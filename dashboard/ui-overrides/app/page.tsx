import { Suspense } from 'react';

import HomeClient from './HomeClient';

export default function HomePage() {
  return (
    <Suspense fallback={<div className="card">Loading dashboard...</div>}>
      <HomeClient />
    </Suspense>
  );
}
