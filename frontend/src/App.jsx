import React, { Suspense, lazy, useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { theme } from './theme';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import { useAuth } from './auth/AuthContext';
import { useRemoteConfig } from './remote/RemoteConfigContext';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const YoneticiPanel = lazy(() => import('./pages/panels/YoneticiPanel'));
const SefPanel = lazy(() => import('./pages/panels/SefPanel'));
const MudurPanel = lazy(() => import('./pages/panels/MudurPanel'));

function App() {
  const { user, logout } = useAuth();
  const { announcement, updateLevel, minSupportedVersion } = useRemoteConfig();
  const [activeTab, setActiveTab] = useState('aktif_projeler');
  const [shellVisible, setShellVisible] = useState(false);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [desktopWindow, setDesktopWindow] = useState(null);
  const [desktopUpdate, setDesktopUpdate] = useState(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const navigate = useNavigate();

  const roleMenus = {
    Yonetici: ['aktif_projeler', 'pano_takip', 'checklist', 'foto_galeri', 'gecmis_projeler', 'fabrika_bakim', 'ayarlar'],
    Sef: ['operasyon_merkezi', 'foto_galeri'],
    Mudur: ['aktif_projeler', 'gecmis_projeler'],
  };

  const menus = roleMenus[user?.rol] || [];

  useEffect(() => {
    if (menus.length > 0 && !menus.includes(activeTab)) {
      setActiveTab(menus[0]);
    }
  }, [user?.rol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setShellVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const looksLikeTauri = typeof window !== 'undefined'
      && (
        String(navigator?.userAgent || '').toLowerCase().includes('tauri')
        || '__TAURI_INTERNALS__' in window
      );
    if (!looksLikeTauri) return;

    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        setDesktopWindow(appWindow);
        setIsDesktopRuntime(true);
      })
      .catch(() => {
        setDesktopWindow(null);
        setIsDesktopRuntime(false);
      });
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime) return;
    import('@tauri-apps/api/core')
      .then(async ({ invoke }) => {
        try {
          const update = await invoke('plugin:updater|check');
          if (update) setDesktopUpdate(update);
        } catch (error) {
          console.warn('Desktop update check failed:', error);
        }
      })
      .catch((error) => {
        console.warn('Updater plugin unavailable:', error);
      });
  }, [isDesktopRuntime]);

  const installDesktopUpdate = async () => {
    if (!desktopUpdate || isInstallingUpdate) return;
    setIsInstallingUpdate(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:updater|download_and_install', { rid: desktopUpdate.rid });
      await invoke('plugin:process|relaunch');
    } catch (error) {
      console.error('Desktop update install failed:', error);
      setIsInstallingUpdate(false);
    }
  };

  const rolePanel = () => {
    if (user?.rol === 'Yonetici') return <YoneticiPanel activeTab={activeTab} kullanici={user} />;
    if (user?.rol === 'Sef') return <SefPanel activeTab={activeTab} kullanici={user} />;
    if (user?.rol === 'Saha') return <Unauthorized />;
    if (user?.rol === 'Mudur') return <MudurPanel activeTab={activeTab} kullanici={user} />;
    return null;
  };

  const appShell = (
    <div style={{backgroundColor: theme.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: theme.font, userSelect: 'none', opacity: shellVisible ? 1 : 0, transform: shellVisible ? 'translateY(0)' : 'translateY(12px)', transition: 'all 280ms ease-out'}}>
      <div style={{position: 'sticky', top: 0, zIndex: 50, backgroundColor: theme.header, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: theme.shadow, height: '64px'}}>
        <div style={{display: 'flex', alignItems: 'center', height: '100%'}}>
          <div data-tauri-drag-region={isDesktopRuntime ? 'true' : undefined} style={{color: theme.accent, fontWeight: '800', fontSize: '20px', marginRight: '40px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div style={{backgroundColor: theme.accent, color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '14px'}}>U</div>
            UNIMAK
          </div>
          <div style={{display: 'flex', height: '100%'}}>
            {menus.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{height: '100%', padding: '0 20px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: theme.font, color: activeTab === tab ? '#ffffff' : '#9ca3af', borderBottom: activeTab === tab ? `3px solid ${theme.primary}` : '3px solid transparent'}}>
                {tab.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
          {isDesktopRuntime ? (
            <div className="desktop-window-controls">
              <button className="desktop-window-btn" onClick={() => desktopWindow?.minimize()} title="Kucult" aria-label="Kucult">
                -
              </button>
              <button className="desktop-window-btn" onClick={() => desktopWindow?.toggleMaximize()} title="Buyut" aria-label="Buyut">
                □
              </button>
              <button className="desktop-window-btn close" onClick={() => desktopWindow?.close()} title="Kapat" aria-label="Kapat">
                ×
              </button>
            </div>
          ) : null}
          <div style={{color: 'white', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <UserCircle size={18}/> {user?.isim} ({user?.rol})
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: theme.danger, border: 'none', padding: '6px 14px', borderRadius: '9999px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'}}>Çıkış</button>
        </div>
      </div>
      {announcement ? (
        <div style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '10px 24px', fontWeight: 600 }}>
          {announcement}
        </div>
      ) : null}
      {desktopUpdate ? (
        <div style={{ backgroundColor: '#fff7ed', color: '#9a3412', padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Yeni masaustu surumu hazir: v{desktopUpdate.version || desktopUpdate.currentVersion}</span>
          <button
            onClick={installDesktopUpdate}
            disabled={isInstallingUpdate}
            style={{ backgroundColor: '#ea580c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 800, cursor: isInstallingUpdate ? 'not-allowed' : 'pointer', opacity: isInstallingUpdate ? 0.7 : 1 }}
          >
            {isInstallingUpdate ? 'Guncelleniyor...' : 'Guncelle ve Yeniden Baslat'}
          </button>
        </div>
      ) : null}
      <div style={{padding: '24px', flexGrow: 1, width: '100%'}}>
        <Suspense fallback={<div style={{ padding: 24 }}>Yukleniyor...</div>}>
          {rolePanel()}
        </Suspense>
      </div>
    </div>
  );

  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yukleniyor...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route
          path="/update-required"
          element={(
            <div style={{ padding: 24 }}>
              <h2>Guncelleme gerekli</h2>
              <p>Bu surum artik desteklenmiyor. Minimum surum: {minSupportedVersion}</p>
              <p>Durum: {updateLevel}</p>
            </div>
          )}
        />
        <Route path="/" element={<ProtectedRoute>{appShell}</ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;