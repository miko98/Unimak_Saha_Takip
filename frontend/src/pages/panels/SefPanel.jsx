import React, { Suspense, lazy } from 'react';

const SefOpsCenter = lazy(() => import('../SefOpsCenter'));
const ProjectGallery = lazy(() => import('../ProjectGallery'));

export default function SefPanel({ activeTab, kullanici }) {
  const view =
    activeTab === 'foto_galeri'
      ? <ProjectGallery kullanici={kullanici} />
      : <SefOpsCenter kullanici={kullanici} />;
  return <Suspense fallback={<div style={{ padding: 20 }}>Yukleniyor...</div>}>{view}</Suspense>;
}

