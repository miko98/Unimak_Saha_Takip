import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, FolderPlus, FolderKanban, CheckCircle, Power, UserCircle, ShieldAlert } from 'lucide-react';
import { theme } from '../theme';
import { fetchJson } from '../api/http';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

function Settings() {
  // --- STATE'LER ---
  const [personeller, setPersoneller] = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hataMesaji, setHataMesaji] = useState('');
  const [projeArama, setProjeArama] = useState('');
  const [projeDurumFiltresi, setProjeDurumFiltresi] = useState('Tümü');
  const [projeSayfa, setProjeSayfa] = useState(1);
  const PROJE_SAYFA_BASI = 12;
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [secureDelete, setSecureDelete] = useState({ project_id: '', reason: '', token: '', phrase: '', admin_password: '' });
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();
  
  // Personel Formu
  const [yeniPersonel, setYeniPersonel] = useState({ kullanici_adi: '', sifre: '', full_name: '', email: '', role: 'Saha' });
  
  // Proje Formu
  const [yeniProje, setYeniProje] = useState({ kod: '', name: '', gruplar: '', yonetici: '' });

  // --- VERİ ÇEKME ---
  const requestJson = (url, options) => fetchJson(url, options);

  const fetchData = async () => {
    setInitialLoading(true);
    try {
      const [personelResult, projeResult, maintenanceResult] = await Promise.allSettled([
        requestJson('/atanabilir_kullanicilar/'),
        requestJson('/is_emri_kayitlari/'),
        requestJson('/system/maintenance'),
      ]);

      const errors = [];

      if (personelResult.status === 'fulfilled') {
        setPersoneller(Array.isArray(personelResult.value) ? personelResult.value : []);
      } else {
        errors.push(personelResult.reason?.message || 'Personel verisi alinamadi.');
      }

      if (projeResult.status === 'fulfilled') {
        setProjeler(Array.isArray(projeResult.value) ? projeResult.value : []);
      } else {
        errors.push(projeResult.reason?.message || 'Proje verisi alinamadi.');
      }

      if (maintenanceResult.status === 'fulfilled') {
        const maintenanceData = maintenanceResult.value;
        if (maintenanceData && typeof maintenanceData.maintenance_mode === 'boolean') {
          setMaintenanceMode(maintenanceData.maintenance_mode);
        }
      } else {
        errors.push(maintenanceResult.reason?.message || 'Bakim modu verisi alinamadi.');
      }

      setHataMesaji(errors[0] || '');
    } catch (error) {
      // Beklenmeyen bir hata olursa mevcut veriyi koru.
      setHataMesaji(error.message || 'Ayarlar verisi alinamadi.');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const confirmAction = (config, action) =>
    setConfirmState({
      open: true,
      ...config,
      onConfirm: async () => {
        setConfirmState({ open: false });
        await action();
      },
      onCancel: () => setConfirmState({ open: false }),
    });

  // --- KULLANICI İŞLEMLERİ ---
  const handlePersonelEkle = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      Object.keys(yeniPersonel).forEach(key => formData.append(key, yeniPersonel[key]));
      await requestJson('/kullanici_ekle/', { method: 'POST', body: formData });
      setYeniPersonel({ kullanici_adi: '', sifre: '', full_name: '', email: '', role: 'Saha' });
      fetchData();
    } catch (error) {
      showToast(`Personel eklenemedi: ${error.message}`, 'error');
    }
  };

  const personelSil = async (id) => {
    confirmAction(
      {
        title: 'UNIMAK ISLEM ONAYI',
        message: 'Personeli sistemden silmek istiyor musunuz?',
        variant: 'danger',
      },
      async () => {
        try {
          const formData = new FormData(); formData.append('user_id', id);
          await requestJson('/kullanici_sil/', { method: 'POST', body: formData });
          fetchData();
        } catch (error) {
          showToast(`Personel silinemedi: ${error.message}`, 'error');
        }
      }
    );
  };

  // --- PROJE İŞLEMLERİ ---
  const handleProjeEkle = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      Object.keys(yeniProje).forEach(key => formData.append(key, yeniProje[key]));
      await requestJson('/is_emri_ekle/', { method: 'POST', body: formData });
      setYeniProje({ kod: '', name: '', gruplar: '', yonetici: '' });
      fetchData();
    } catch (error) {
      showToast(`Is emri eklenemedi: ${error.message}`, 'error');
    }
  };

  const projeDurumDegistir = async (id, mevcutDurum) => {
    const yeniDurum = mevcutDurum === 'Aktif' ? 'Tamamlandı' : 'Aktif';
    try {
      const formData = new FormData(); formData.append('project_id', id); formData.append('durum', yeniDurum);
      await requestJson('/is_emri_kart_durum_guncelle/', { method: 'POST', body: formData });
      fetchData();
    } catch (error) {
      showToast(`Durum guncellenemedi: ${error.message}`, 'error');
    }
  };

  const toggleMaintenanceMode = async () => {
    try {
      const formData = new FormData();
      formData.append('enabled', maintenanceMode ? 'off' : 'on');
      const data = await requestJson('/system/maintenance', { method: 'POST', body: formData });
      setMaintenanceMode(!!data.maintenance_mode);
    } catch (error) {
      showToast(`Bakim modu guncellenemedi: ${error.message}`, 'error');
    }
  };

  const projeSoftSil = async (id) => {
    confirmAction(
      {
        title: 'UNIMAK ISLEM ONAYI',
        message: 'Bu projeyi arsive almak istiyor musunuz?',
        variant: 'warning',
      },
      async () => {
        try {
          const formData = new FormData();
          formData.append('project_id', id);
          await requestJson('/proje_soft_sil/', { method: 'POST', body: formData });
          fetchData();
        } catch (error) {
          showToast(`Proje arsivlenemedi: ${error.message}`, 'error');
        }
      }
    );
  };

  const baslatKaliciSilme = async () => {
    try {
      const formData = new FormData();
      formData.append('project_id', secureDelete.project_id);
      formData.append('reason', secureDelete.reason || 'Yonetici talebi');
      const data = await requestJson('/proje_kalici_silme_baslat/', { method: 'POST', body: formData });
      setSecureDelete((prev) => ({ ...prev, token: data.delete_token || '', phrase: data.confirm_phrase || '' }));
    } catch (error) {
      showToast(`Kalici silme baslatilamadi: ${error.message}`, 'error');
    }
  };

  const onaylaKaliciSilme = async () => {
    try {
      const formData = new FormData();
      formData.append('project_id', secureDelete.project_id);
      formData.append('delete_token', secureDelete.token);
      formData.append('confirm_phrase', secureDelete.phrase);
      formData.append('admin_password', secureDelete.admin_password);
      await requestJson('/proje_kalici_sil_onay/', { method: 'POST', body: formData });
      showToast('Proje kalici olarak silindi.', 'success');
      setSecureDelete({ project_id: '', reason: '', token: '', phrase: '', admin_password: '' });
      fetchData();
    } catch (error) {
      showToast(`Kalici silme tamamlanamadi: ${error.message}`, 'error');
    }
  };

  const normalizeText = (v) =>
    (v || '')
      .toString()
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const filteredProjeler = projeler.filter((pr) => {
    if (projeDurumFiltresi !== 'Tümü' && pr.durum !== projeDurumFiltresi) return false;
    const q = normalizeText(projeArama.trim());
    if (!q) return true;
    const target = normalizeText(`${pr.kod} ${pr.name} ${pr.yonetici} ${pr.gruplar || ''}`);
    return target.includes(q);
  });

  const toplamSayfa = Math.max(1, Math.ceil(filteredProjeler.length / PROJE_SAYFA_BASI));
  const aktifSayfa = Math.min(projeSayfa, toplamSayfa);
  const sayfaliProjeler = filteredProjeler.slice(
    (aktifSayfa - 1) * PROJE_SAYFA_BASI,
    aktifSayfa * PROJE_SAYFA_BASI
  );

  useEffect(() => {
    setProjeSayfa(1);
  }, [projeArama, projeDurumFiltresi]);

  if (initialLoading) {
    return (
      <div style={{ width: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ padding: '16px 20px', borderRadius: 10, backgroundColor: '#f8fafc', border: `1px solid ${theme.border}`, color: theme.textMuted, fontWeight: 700 }}>
          Veriler yukleniyor...
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', width: '100%', userSelect: 'none' }}>
      
      {/* SOL KOLON: PERSONEL YÖNETİMİ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {hataMesaji && (
          <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
            {hataMesaji}
          </div>
        )}
        
        {/* Personel Ekleme Formu */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, borderTop: `4px solid ${theme.primary}`, boxShadow: theme.shadow }}>
          <h3 style={{ margin: '0 0 20px 0', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}><UserPlus color={theme.primary}/> Yeni Personel Hesabı Aç</h3>
          <form onSubmit={handlePersonelEkle} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <input type="text" placeholder="Adı Soyadı (Örn: İlhan Ardalı)" value={yeniPersonel.full_name} onChange={e => setYeniPersonel({...yeniPersonel, full_name: e.target.value})} style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }} required/>
            <input type="email" placeholder="E-Posta" value={yeniPersonel.email} onChange={e => setYeniPersonel({...yeniPersonel, email: e.target.value})} style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }}/>
            <input type="text" placeholder="Sisteme Giriş Adı" value={yeniPersonel.kullanici_adi} onChange={e => setYeniPersonel({...yeniPersonel, kullanici_adi: e.target.value})} style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }} required/>
            <input type="text" placeholder="Şifre" value={yeniPersonel.sifre} onChange={e => setYeniPersonel({...yeniPersonel, sifre: e.target.value})} style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }} required/>
            <select value={yeniPersonel.role} onChange={e => setYeniPersonel({...yeniPersonel, role: e.target.value})} style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', gridColumn: 'span 2' }}>
              <option value="Saha">Saha</option>
              <option value="Sef">Şef</option>
              <option value="Mudur">Müdür</option>
            </select>
            <button type="submit" style={{ gridColumn: 'span 2', padding: '12px', backgroundColor: theme.primary, color: 'white', border: 'none', borderRadius: theme.radiusBtn, fontWeight: 'bold', cursor: 'pointer' }}>Hesabı Aç ve Sisteme Ekle</button>
          </form>
        </div>

        {/* Kayıtlı Personeller Listesi */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <h3 style={{ margin: '0 0 20px 0', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}><Users color={theme.textMuted}/> Kayıtlı Personeller</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {personeller.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <UserCircle size={24} color={(p.role === 'Sef' || p.role === 'Mudur') ? theme.primary : theme.textMuted} />
                  <div>
                    <div style={{ fontWeight: 'bold', color: theme.textMain }}>{p.full_name}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Kullanıcı: {p.kullanici_adi} | {p.role}</div>
                  </div>
                </div>
                <button onClick={() => personelSil(p.id)} style={{ backgroundColor: '#fee2e2', color: theme.danger, border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* SAĞ KOLON: PROJE YÖNETİMİ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Proje Ekleme Formu */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, borderTop: `4px solid ${theme.accent}`, boxShadow: theme.shadow }}>
          <h3 style={{ margin: '0 0 20px 0', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}><FolderPlus color={theme.accent}/> Yeni Proje Ekle</h3>
          <form onSubmit={handleProjeEkle} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textMuted }}>Proje Kodu</label>
              <input type="text" placeholder="Örn: 2027-UC-002" value={yeniProje.kod} onChange={e => setYeniProje({...yeniProje, kod: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', marginTop: '5px' }} required/>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textMuted }}>Proje Adı</label>
              <input type="text" placeholder="Örn: X Makinesi Revizyonu" value={yeniProje.name} onChange={e => setYeniProje({...yeniProje, name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', marginTop: '5px' }} required/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textMuted }}>Proje Grupları (İsteğe Bağlı)</label>
                <input type="text" placeholder="Örn: Mekanik, Elektrik" value={yeniProje.gruplar} onChange={e => setYeniProje({...yeniProje, gruplar: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', marginTop: '5px' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textMuted }}>Yönetici Adı</label>
                <input type="text" placeholder="Örn: Mehmet Nilüfer" value={yeniProje.yonetici} onChange={e => setYeniProje({...yeniProje, yonetici: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', marginTop: '5px' }} required/>
              </div>
            </div>
            <button type="submit" style={{ padding: '12px', backgroundColor: theme.accent, color: 'white', border: 'none', borderRadius: theme.radiusBtn, fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>Yeni Projeyi Sisteme Kaydet</button>
          </form>
        </div>

        {/* Proje Durumu Yönetimi */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <h3 style={{ margin: '0 0 20px 0', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}><FolderKanban color={theme.textMuted}/> Sistemdeki Projeler (Aç/Kapat)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '10px', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Proje kodu, adı, yönetici veya gruba göre ara..."
              value={projeArama}
              onChange={(e) => setProjeArama(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }}
            />
            <select
              value={projeDurumFiltresi}
              onChange={(e) => setProjeDurumFiltresi(e.target.value)}
              style={{ padding: '10px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none' }}
            >
              <option value="Tümü">Tümü</option>
              <option value="Aktif">Aktif</option>
              <option value="Tamamlandı">Tamamlandı</option>
            </select>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px', fontWeight: 700 }}>
            Toplam {filteredProjeler.length} proje • Sayfa {aktifSayfa}/{toplamSayfa}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
            {filteredProjeler.length === 0 ? <div style={{ color: theme.textMuted, fontSize: '13px' }}>Filtreye uygun proje yok.</div> : sayfaliProjeler.map(pr => (
              <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div>
                  <div style={{ fontWeight: '800', color: theme.textMain, fontSize: '15px' }}>{pr.kod} - {pr.name}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Yönetici: {pr.yonetici} | Gruplar: {pr.gruplar || '-'}</div>
                </div>
                
                {/* Durum Değiştirme Butonu */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => projeDurumDegistir(pr.id, pr.durum)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: pr.durum === 'Aktif' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: pr.durum === 'Aktif' ? theme.success : theme.danger }}>
                    {pr.durum === 'Aktif' ? <><CheckCircle size={16}/> AKTİF (AÇIK)</> : <><Power size={16}/> TAMAMLANDI (KAPALI)</>}
                  </button>
                  <button onClick={() => projeSoftSil(pr.id)} style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>
                    Arşive Al
                  </button>
                </div>

              </div>
            ))}
          </div>
          {filteredProjeler.length > PROJE_SAYFA_BASI && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <button
                onClick={() => setProjeSayfa((s) => Math.max(1, s - 1))}
                disabled={aktifSayfa === 1}
                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: aktifSayfa === 1 ? '#f8fafc' : 'white', color: theme.textMain, cursor: aktifSayfa === 1 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
              >
                Önceki
              </button>
              <button
                onClick={() => setProjeSayfa((s) => Math.min(toplamSayfa, s + 1))}
                disabled={aktifSayfa === toplamSayfa}
                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: aktifSayfa === toplamSayfa ? '#f8fafc' : 'white', color: theme.textMain, cursor: aktifSayfa === toplamSayfa ? 'not-allowed' : 'pointer', fontWeight: 700 }}
              >
                Sonraki
              </button>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <h3 style={{ margin: '0 0 12px 0', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert color={theme.danger}/> Güvenli Sistem Kontrolleri
          </h3>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 10 }}>
            Bakım modu açıkken sadece yönetici erişebilir. Kalıcı silme için çift onay + yönetici şifresi gerekir.
          </div>
          <button onClick={toggleMaintenanceMode} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: maintenanceMode ? '#b91c1c' : '#0ea5e9', color: 'white', fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}>
            {maintenanceMode ? 'Bakım Modunu Kapat' : 'Bakım Modunu Aç'}
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Kalıcı silinecek Proje ID" value={secureDelete.project_id} onChange={(e) => setSecureDelete({ ...secureDelete, project_id: e.target.value })} style={{ padding: '10px', borderRadius: 8, border: `1px solid ${theme.border}` }} />
            <input placeholder="Silme nedeni" value={secureDelete.reason} onChange={(e) => setSecureDelete({ ...secureDelete, reason: e.target.value })} style={{ padding: '10px', borderRadius: 8, border: `1px solid ${theme.border}` }} />
          </div>
          <button onClick={baslatKaliciSilme} style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, background: 'white', fontWeight: 700, cursor: 'pointer' }}>
            Kalıcı Silme Başlat
          </button>
          {secureDelete.token && (
            <div style={{ marginTop: 12, border: `1px dashed ${theme.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Token: <b>{secureDelete.token}</b> | Onay metni: <b>{secureDelete.phrase}</b></div>
              <input placeholder="Yönetici şifresi" type="password" value={secureDelete.admin_password} onChange={(e) => setSecureDelete({ ...secureDelete, admin_password: e.target.value })} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 8, border: `1px solid ${theme.border}` }} />
              <button onClick={onaylaKaliciSilme} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, border: 'none', background: '#b91c1c', color: 'white', fontWeight: 800, cursor: 'pointer' }}>
                Kalıcı Silmeyi Onayla
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
    <UnimakConfirmModal
      open={confirmState.open}
      title={confirmState.title}
      message={confirmState.message}
      variant={confirmState.variant}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
      onConfirm={confirmState.onConfirm}
      onCancel={confirmState.onCancel}
    />
    <UnimakToast open={toastState.open} message={toastState.message} variant={toastState.variant} toastId={toastState.id} durationMs={toastState.durationMs} onClose={dismissToast} />
    </>
  );
}

export default Settings;