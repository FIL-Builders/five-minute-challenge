import { Suspense } from 'react';

import RunClientPage from './ClientPage';

export default function RunPage() {
  return (
    <Suspense fallback={<div className="card">Loading run detail...</div>}>
      <RunClientPage />
    </Suspense>
  );
}
