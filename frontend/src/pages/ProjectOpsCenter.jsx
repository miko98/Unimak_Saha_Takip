import React, { useEffect, useMemo, useState } from 'react';
import { FolderPlus, RefreshCw, Search, UserCog } from 'lucide-react';
import { fetchJsonWithFallback } from '../api/http';
import { readCache, writeCache } from '../api/localCache';
import { theme } from '../theme';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

const CACHE_TTL_FAST_MS = 60 * 1000;
const CACHE_TTL_SLOW_MS = 10 * 60 * 1000;

export default function ProjectOpsCenter({ kullanici }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [workOrderFilter, setWorkOrderFilter] = useState('');
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();
  const requestJsonWithFallback = fetchJsonWithFallback;

  const [newWorkOrder, setNewWorkOrder] = useState({
    kod: '',
    name: '',
    gruplar: '',
    yonetici: '',
    yil: '',
  });

  const [assignment, setAssignment] = useState({
    yonetici: '',
    gruplar: '',
    name: '',
  });

  const selectedWorkOrder = useMemo(() => {
    if (!Array.isArray(workOrders)) return null;
    return workOrders.find((w) => w.id.toString() === selectedWorkOrderId) || null;
  }, [workOrders, selectedWorkOrderId]);

  const filteredWorkOrders = useMemo(() => {
    const base = selectedWorkOrderId
      ? workOrders.filter((w) => w.id.toString() === selectedWorkOrderId)
      : workOrders;
    const q = workOrderFilter.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (w) =>
        (w.kod || '').toLowerCase().includes(q) ||
        (w.name || '').toLowerCase().includes(q) ||
        (w.yonetici || '').toLowerCase().includes(q)
    );
  }, [workOrders, workOrderFilter, selectedWorkOrderId]);

  const allUsers = useMemo(() => (Array.isArray(users) ? users : []), [users]);

  const loadWorkOrders = async () => {
    const yilQuery = selectedYear ? `?yil=${selectedYear}` : '';
    const { data } = await requestJsonWithFallback([
      `/is_emri_kayitlari/${yilQuery}`,
      `/projeler/${yilQuery}`,
    ]);
    const safe = Array.isArray(data) ? data : [];
    setWorkOrders(safe);
    writeCache(`ops_workorders_${selectedYear || 'all'}`, safe);
    if (!selectedWorkOrderId && safe.length > 0) {
      setSelectedWorkOrderId(safe[0].id.toString());
    }
    return safe;
  };

  const loadAvailableYears = async () => {
    const { data } = await requestJsonWithFallback(['/meta/yillar', '/is_emri_kayitlari/', '/projeler/']);
    const yearsFromMeta = Array.isArray(data?.years) ? data.years : null;
    const safe = Array.isArray(data) ? data : [];
    const years = (yearsFromMeta || [...new Set(safe.map((w) => Number(w.yil)).filter(Boolean))]).sort((a, b) => b - a);
    setAvailableYears(years);
    writeCache('ops_available_years', years);
    if (!selectedYear && years.length > 0) {
      setSelectedYear(String(years[0]));
      setNewWorkOrder((prev) => ({ ...prev, yil: String(years[0]) }));
    }
    return years;
  };

  const loadUsers = async () => {
    try {
      const { data } = await requestJsonWithFallback(['/atanabilir_kullanicilar/', '/kullanicilar/']);
      const safe = Array.isArray(data) ? data : [];
      setUsers(safe);
      writeCache('ops_users', safe);
      return safe;
    } catch {
      // Sef rolünde bu endpoint 403 dönebiliyor; mevcut kullanıcı listesini koruyalım.
      return [];
    }
  };

  useEffect(() => {
    const cachedYears = readCache('ops_available_years', [], CACHE_TTL_SLOW_MS);
    const cachedUsers = readCache('ops_users', [], CACHE_TTL_FAST_MS);
    const cachedWorkOrders = readCache('ops_workorders_all', [], CACHE_TTL_FAST_MS);
    if (Array.isArray(cachedYears) && cachedYears.length > 0) {
      setAvailableYears(cachedYears);
      if (!selectedYear) {
        const firstYear = String(cachedYears[0]);
        setSelectedYear(firstYear);
        setNewWorkOrder((prev) => ({ ...prev, yil: firstYear }));
      }
    }
    if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
      setUsers(cachedUsers);
    }
    if (Array.isArray(cachedWorkOrders) && cachedWorkOrders.length > 0) {
      setWorkOrders(cachedWorkOrders);
      if (!selectedWorkOrderId) {
        setSelectedWorkOrderId(String(cachedWorkOrders[0]?.id || ''));
      }
      setInitialLoading(false);
    }

    setInitialLoading(true);
    Promise.all([loadAvailableYears(), loadUsers()])
      .then(([years]) => {
        setLoadError(years.length === 0 ? 'Yıl bilgisi bulunamadı. Tümü ile kayıtlar listeleniyor.' : '');
      })
      .catch(() => setLoadError('Veritabanı bağlantısı sırasında hata oluştu.'));
    Promise.resolve(loadWorkOrders())
      .catch(() => setLoadError('İş emirleri yüklenemedi.'))
      .finally(() => setInitialLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialLoading) return;
    const cachedByYear = readCache(`ops_workorders_${selectedYear || 'all'}`, [], CACHE_TTL_FAST_MS);
    if (Array.isArray(cachedByYear) && cachedByYear.length > 0) {
      setWorkOrders(cachedByYear);
    }
    loadWorkOrders().catch(() => setLoadError('İş emirleri yüklenemedi.'));
  }, [initialLoading, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedWorkOrder) return;
    setAssignment({
      yonetici: selectedWorkOrder.yonetici || '',
      gruplar: selectedWorkOrder.gruplar || '',
      name: selectedWorkOrder.name || '',
    });
  }, [selectedWorkOrder]);

  const postForm = async (url, payload) => {
    const formData = new FormData();
    Object.entries(payload).forEach(([k, v]) => formData.append(k, v ?? ''));
    const fallbackMap = {
      '/is_emri_ekle/': ['/is_emri_ekle/', '/proje_ekle/'],
      '/is_emri_detay_guncelle/': ['/is_emri_detay_guncelle/', '/proje_detay_guncelle/'],
      '/is_emri_kart_durum_guncelle/': ['/is_emri_kart_durum_guncelle/', '/proje_durum_guncelle/'],
    };
    const targetUrls = fallbackMap[url] || [url];
    const { data } = await requestJsonWithFallback(targetUrls, { method: 'POST', body: formData });
    if (data?.hata) throw new Error(data.hata);
    return data;
  };

  const createWorkOrder = async () => {
    if (!newWorkOrder.kod || !newWorkOrder.name) {
      showToast('Is emri no ve adi zorunlu.', 'info');
      return;
    }
    if (!(newWorkOrder.yil || selectedYear)) {
      showToast('Kayit icin gecerli bir yil secin.', 'info');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...newWorkOrder,
        yil: Number(newWorkOrder.yil || selectedYear),
        // Eski backend sürümlerinde yonetici zorunlu; boşsa oturum kullanıcısını yaz.
        yonetici: (newWorkOrder.yonetici || kullanici?.isim || 'Atanmadi').trim(),
      };
      await postForm('/is_emri_ekle/', payload);
      setNewWorkOrder({ kod: '', name: '', gruplar: '', yonetici: '', yil: selectedYear });
      await loadAvailableYears();
      await loadWorkOrders();
      showToast('Yeni is emri olusturuldu.', 'success');
    } catch (error) {
      showToast(`Is emri eklenemedi: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    if (!selectedWorkOrderId) return;
    setBusy(true);
    try {
      await postForm('/is_emri_detay_guncelle/', { project_id: selectedWorkOrderId, ...assignment });
      await loadWorkOrders();
      showToast('Is emri bilgileri guncellendi.', 'success');
    } catch (error) {
      showToast(`Guncelleme hatasi: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const archiveWorkOrder = async (durum) => {
    if (!selectedWorkOrderId) return;
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: durum === 'Tamamlandı'
        ? 'Is emrini arsive almak istiyor musunuz?'
        : 'Is emrini tekrar aktif yapmak istiyor musunuz?',
      variant: 'warning',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        setBusy(true);
        try {
          await postForm('/is_emri_kart_durum_guncelle/', { project_id: selectedWorkOrderId, durum });
          await loadWorkOrders();
          showToast('Durum guncellendi.', 'success');
        } catch (error) {
          showToast(`Durum guncellenemedi: ${error.message}`, 'error');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  if (initialLoading) {
    return (
      <div style={{ width: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ padding: '16px 20px', borderRadius: 10, backgroundColor: '#f8fafc', border: `1px solid ${theme.border}`, color: '#64748b', fontWeight: 700 }}>
          Is emri verileri yukleniyor...
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16 }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>İş Emri Operasyonları</h3>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 600 }}>
          İş emri ekleme, atama ve arşiv yönetimi tek ekranda.
        </p>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>Çalışma Yılı:</span>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
            <option value="">Tümü</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#0f172a', fontWeight: 800 }}>
          <FolderPlus size={16} /> Yeni İş Emri Ekle
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px 1fr auto', gap: 8 }}>
          <input placeholder="İş Emri No" value={newWorkOrder.kod} onChange={(e) => setNewWorkOrder((p) => ({ ...p, kod: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
          <input placeholder="İş Emri Adı" value={newWorkOrder.name} onChange={(e) => setNewWorkOrder((p) => ({ ...p, name: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
          <input placeholder="Gruplar" value={newWorkOrder.gruplar} onChange={(e) => setNewWorkOrder((p) => ({ ...p, gruplar: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
          <select value={newWorkOrder.yil} onChange={(e) => setNewWorkOrder((p) => ({ ...p, yil: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
            {availableYears.length === 0 ? <option value="">Yıl yok</option> : availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={newWorkOrder.yonetici} onChange={(e) => setNewWorkOrder((p) => ({ ...p, yonetici: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
            <option value="">Yönetici seçme (opsiyonel)</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.full_name || u.kullanici_adi}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
          <button onClick={createWorkOrder} disabled={busy} style={{ border: 'none', borderRadius: 8, padding: '10px 12px', background: '#0f172a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
            Kaydet
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedWorkOrderId}
            onChange={(e) => setSelectedWorkOrderId(e.target.value)}
            style={{ minWidth: 320, borderRadius: 8, border: '1px solid #cbd5e1', padding: '10px 12px', fontWeight: 700 }}
          >
            <option value="">Tümü</option>
            {workOrders.map((w) => (
              <option key={w.id} value={w.id}>
                {w.kod} - {w.name} ({w.yil || '-'})
              </option>
            ))}
          </select>
          <button
            onClick={() => Promise.all([loadWorkOrders(), loadUsers()])}
            disabled={busy}
            style={{ border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', background: '#e2e8f0', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={15} /> Yenile
          </button>
          <div style={{ color: '#64748b', fontWeight: 700 }}>Kullanıcı: {kullanici?.isim || '-'}</div>
        </div>
        {loadError && <div style={{ marginTop: 10, color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>{loadError}</div>}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a', fontWeight: 800 }}>
            <UserCog size={16} /> İş Emri Aktif / Arşiv Yönetimi
          </div>
          <button
            onClick={() => {
              setWorkOrderFilter('');
              setSelectedWorkOrderId('');
            }}
            disabled={busy}
            style={{ border: 'none', borderRadius: 8, padding: '8px 12px', background: '#e2e8f0', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
          >
            Seçimi Temizle
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10, marginBottom: 12 }}>
          <select
            value={selectedWorkOrderId}
            onChange={(e) => setSelectedWorkOrderId(e.target.value)}
            style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '10px 12px', fontWeight: 700 }}
          >
            <option value="">Tümü</option>
            {workOrders.map((w) => (
              <option key={w.id} value={w.id}>
                {w.kod}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', background: '#fff' }}>
            <Search size={15} color="#64748b" />
            <input
              value={workOrderFilter}
              onChange={(e) => setWorkOrderFilter(e.target.value)}
              placeholder="İş emri no, adı veya yönetici ile ara"
              style={{ border: 'none', outline: 'none', width: '100%', padding: '10px 0' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['İş Emri No', 'İş Emri Adı', 'Gruplar', 'Yönetici', 'Durum', 'İşlem'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders.map((w) => (
                <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0f172a' }}>{w.kod}</td>
                  <td style={{ padding: '10px 12px' }}>{w.name}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{w.gruplar || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{w.yonetici || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ borderRadius: 999, padding: '4px 10px', fontWeight: 800, fontSize: 12, background: w.durum === 'Tamamlandı' ? '#fef3c7' : '#dcfce7', color: w.durum === 'Tamamlandı' ? '#92400e' : '#166534' }}>
                      {w.durum === 'Tamamlandı' ? 'Arşiv' : 'Aktif'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setSelectedWorkOrderId(w.id.toString());
                          setAssignment({ name: w.name || '', yonetici: w.yonetici || '', gruplar: w.gruplar || '' });
                        }}
                        style={{ border: 'none', borderRadius: 6, padding: '6px 9px', background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Seç
                      </button>
                      <button
                        onClick={() => archiveWorkOrder(w.durum === 'Tamamlandı' ? 'Aktif' : 'Tamamlandı')}
                        disabled={busy}
                        style={{ border: 'none', borderRadius: 6, padding: '6px 9px', background: w.durum === 'Tamamlandı' ? '#16a34a' : '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                      >
                        {w.durum === 'Tamamlandı' ? 'Aç' : 'Arşiv'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 12 }}>
          <input placeholder="İş Emri Adı" value={assignment.name} onChange={(e) => setAssignment((p) => ({ ...p, name: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
          <select value={assignment.yonetici} onChange={(e) => setAssignment((p) => ({ ...p, yonetici: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
            <option value="">Yönetici seçme (opsiyonel)</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.full_name || u.kullanici_adi}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
          <input placeholder="Gruplar / Ekipler" value={assignment.gruplar} onChange={(e) => setAssignment((p) => ({ ...p, gruplar: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
          <button onClick={saveAssignment} disabled={busy || !selectedWorkOrderId} style={{ border: 'none', borderRadius: 8, padding: '10px 12px', background: '#0369a1', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
            Kaydet
          </button>
        </div>
      </div>
    </div>
    <UnimakConfirmModal
      open={confirmState.open}
      title={confirmState.title}
      message={confirmState.message}
      variant={confirmState.variant}
      onConfirm={confirmState.onConfirm}
      onCancel={confirmState.onCancel}
    />
    <UnimakToast open={toastState.open} message={toastState.message} variant={toastState.variant} toastId={toastState.id} durationMs={toastState.durationMs} onClose={dismissToast} />
    </>
  );
}

