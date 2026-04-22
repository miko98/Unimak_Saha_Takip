import React from 'react';
import Dashboard from '../Dashboard';
import ChecklistManagement from '../ChecklistManagement';
import ProjectGallery from '../ProjectGallery';

export default function SahaPanel({ activeTab, kullanici }) {
  if (activeTab === 'checklist') return <ChecklistManagement kullanici={kullanici} />;
  if (activeTab === 'foto_galeri') return <ProjectGallery kullanici={kullanici} />;
  return <Dashboard kullanici={kullanici} />;
}

