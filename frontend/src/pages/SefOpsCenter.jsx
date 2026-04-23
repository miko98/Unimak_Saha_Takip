import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ClipboardList, Layers3, Wrench, FolderArchive, Settings2 } from 'lucide-react';
import { fetchJsonWithFallback } from '../api/http';
import { theme } from '../theme';
import Dashboard from './Dashboard';
import ChecklistManagement from './ChecklistManagement';
import PanoTakip from './PanoTakip';
import FabrikaBakim from './FabrikaBakim';
import GecmisProjeler from './GecmisProjeler';
import ProjectOpsCenter from './ProjectOpsCenter';

const MODULES = [
  { id: 'is_emri', label: 'İş Emirleri', icon: Activity },
  { id: 'checklist', label: 'Kontrol Listeleri', icon: ClipboardList },
  { id: 'pano', label: 'Pano Takibi', icon: Layers3 },
  { id: 'bakim', label: 'Fabrika Bakım', icon: Wrench },
  { id: 'arsiv', label: 'Arşiv', icon: FolderArchive },
  { id: 'proje_ops', label: 'İş Emri Operasyon', icon: Settings2 },
];

export default function SefOpsCenter({ kullanici }) {
  const [activeModule, setActiveModule] = useState('is_emri');
  const [stats, setStats] = useState({
    aktifProje: 0,
    acikIs: 0,
    acikBakim: 0,
    fotografliKayit: 0,
  });

  useEffect(() => {
    const fetchWithFallback = async (paths) => {
      try {
        const { data } = await fetchJsonWithFallback(paths);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    };

    const fetchStats = async () => {
      try {
        const [projects, workOrders, maintenances] = await Promise.all([
          fetchWithFallback(['/is_emri_kayitlari/', '/projeler/']),
          fetchWithFallback(['/is_emirleri/']),
          fetchWithFallback(['/bakimlar/']),
        ]);

        const activeProjects = projects.filter((p) => p.durum !== 'Tamamlandı').length;
        const openWorkOrders = workOrders.filter((w) => w.durum !== 'Tamamlandı').length;
        const openMaintenance = maintenances.filter((m) => m.durum !== 'Çözüldü').length;
        const photos = workOrders.filter((w) => Boolean(w.resim_url)).length;

        setStats({
          aktifProje: activeProjects,
          acikIs: openWorkOrders,
          acikBakim: openMaintenance,
          fotografliKayit: photos,
        });
      } catch {
        // non-blocking
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, 10000);
    return () => clearInterval(timer);
  }, []);

  const cards = useMemo(
    () => [
      { title: 'Aktif İş Emri', value: stats.aktifProje },
      { title: 'Açık İş', value: stats.acikIs },
      { title: 'Açık Bakım', value: stats.acikBakim },
      { title: 'Fotoğraflı Kayıt', value: stats.fotografliKayit },
    ],
    [stats]
  );

  const renderModule = () => {
    if (activeModule === 'is_emri') return <Dashboard kullanici={kullanici} />;
    if (activeModule === 'checklist') return <ChecklistManagement kullanici={kullanici} />;
    if (activeModule === 'pano') return <PanoTakip />;
    if (activeModule === 'bakim') return <FabrikaBakim kullanici={kullanici} />;
    if (activeModule === 'arsiv') return <GecmisProjeler />;
    if (activeModule === 'proje_ops') return <ProjectOpsCenter kullanici={kullanici} />;
    return <Dashboard kullanici={kullanici} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          backgroundColor: '#fff',
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          padding: 16,
          boxShadow: theme.shadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a' }}>UNIMAK Şef Operasyon Merkezi</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 600 }}>
              İş emri, checklist, pano, bakım ve arşiv tek ekranda.
            </p>
          </div>
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>Rol: ŞEF</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              backgroundColor: '#fff',
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 14,
              boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>{card.title}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 10,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = activeModule === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: active ? '#0f172a' : '#f1f5f9',
                color: active ? '#fff' : '#334155',
              }}
            >
              <Icon size={16} />
              {m.label}
            </button>
          );
        })}
      </div>

      {renderModule()}
    </div>
  );
}

