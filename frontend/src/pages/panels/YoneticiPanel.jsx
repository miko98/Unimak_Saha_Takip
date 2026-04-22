import React, { Suspense, lazy } from 'react';

const Dashboard = lazy(() => import('../Dashboard'));
const PanoTakip = lazy(() => import('../PanoTakip'));
const ChecklistManagement = lazy(() => import('../ChecklistManagement'));
const ProjectGallery = lazy(() => import('../ProjectGallery'));
const FabrikaBakim = lazy(() => import('../FabrikaBakim'));
const GecmisProjeler = lazy(() => import('../GecmisProjeler'));
const Settings = lazy(() => import('../Settings'));

export default function YoneticiPanel({ activeTab, kullanici }) {
  let view = <Dashboard kullanici={kullanici} />;
  if (activeTab === 'pano_takip') view = <PanoTakip />;
  else if (activeTab === 'checklist') view = <ChecklistManagement kullanici={kullanici} />;
  else if (activeTab === 'foto_galeri') view = <ProjectGallery kullanici={kullanici} />;
  else if (activeTab === 'fabrika_bakim') view = <FabrikaBakim kullanici={kullanici} />;
  else if (activeTab === 'gecmis_projeler') view = <GecmisProjeler />;
  else if (activeTab === 'ayarlar') view = <Settings />;

  return <Suspense fallback={<div style={{ padding: 20 }}>Yukleniyor...</div>}>{view}</Suspense>;
}

