import React, { useState, useEffect } from 'react';
import { AlertOctagon, Wrench, CheckCircle, Camera, Activity, FileText, Image as ImageIcon, X, ArrowRight } from 'lucide-react';
import { theme } from '../theme';
import { API_BASE_URL } from '../config';
import { fetchJson } from '../api/http';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

function FabrikaBakim({ kullanici }) {
  const [bakimlar, setBakimlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hataMesaji, setHataMesaji] = useState('');
  
  const [arizaModalAcik, setArizaModalAcik] = useState(false);
  const [guncellemeModalAcik, setGuncellemeModalAcik] = useState(false);
  const [tamEkranFoto, setTamEkranFoto] = useState(null);

  const [seciliBakim, setSeciliBakim] = useState(null);
  const [yeniDurum, setYeniDurum] = useState('');
  const [yeniNot, setYeniNot] = useState('');
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);

  const [yeniAriza, setYeniAriza] = useState({ makine_kodu: '', kisim: '', islem: '', oncelik: 'Normal' });
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();

  // --- VERİ ÇEKME ---
  const requestJson = (url, options) => fetchJson(url, options);

  const fetchBakimlar = async () => {
    try {
      const data = await requestJson('/bakimlar/');
      const safe = Array.isArray(data) ? data : [];
      setBakimlar([...safe].reverse());
      setHataMesaji('');
      setLoading(false);
    } catch (error) {
      console.error(error);
      setBakimlar([]);
      setHataMesaji(error.message || 'Bakım kayıtları alınamadı.');
      setLoading(false);
    }
  };

  useEffect(() => { fetchBakimlar(); const interval = setInterval(fetchBakimlar, 5000); return () => clearInterval(interval); }, []);

  // --- ARIZA BİLDİR (POST) ---
  const arizaBildir = async (e) => {
    e.preventDefault();
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Ariza kaydi olusturulacak ve sisteme alarm dusecek. Devam edilsin mi?',
      variant: 'danger',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        try {
          const formData = new FormData();
          formData.append('makine_kodu', yeniAriza.makine_kodu); formData.append('kisim', yeniAriza.kisim);
          formData.append('islem', yeniAriza.islem); formData.append('oncelik', yeniAriza.oncelik); formData.append('personel', kullanici.isim);

          await requestJson('/bakim_ekle/', { method: 'POST', body: formData });
          setYeniAriza({ makine_kodu: '', kisim: '', islem: '', oncelik: 'Normal' });
          setArizaModalAcik(false); fetchBakimlar();
        } catch (error) {
          showToast(`Ariza bildirilemedi: ${error.message}`, 'error');
        }
      },
    });
  };

  // --- DURUM GÜNCELLE VE FOTO YÜKLE ---
  const bakimGuncelle = async () => {
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Bakim durumu guncellenecek. Devam edilsin mi?',
      variant: 'warning',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        try {
          const formData = new FormData();
          formData.append('bakim_id', seciliBakim.id); formData.append('durum', yeniDurum); formData.append('notlar', yeniNot);
          await requestJson('/bakim_guncelle/', { method: 'POST', body: formData });
          setGuncellemeModalAcik(false); fetchBakimlar();
        } catch (error) {
          showToast(`Guncellenemedi: ${error.message}`, 'error');
        }
      },
    });
  };

  const fotoYukle = async (e) => {
    const file = e.target.files[0];
    if (!file || !seciliBakim) return;
    setFotoYukleniyor(true);
    try {
      const formData = new FormData(); formData.append('bakim_id', seciliBakim.id); formData.append('file', file);
      await requestJson('/bakim_foto_yukle/', { method: 'POST', body: formData });
      fetchBakimlar(); setGuncellemeModalAcik(false);
    } catch (error) {
      showToast(`Fotograf yuklenemedi: ${error.message}`, 'error');
    } finally { setFotoYukleniyor(false); }
  };

  const islemSecAc = (b) => { setSeciliBakim(b); setYeniDurum(b.durum); setYeniNot(b.notlar !== '-' ? b.notlar : ''); setGuncellemeModalAcik(true); };

  // İSTATİSTİKLER
  const kritikSayisi = bakimlar.filter(b => b.oncelik === 'KRİTİK' && b.durum !== 'Çözüldü').length;
  const acikSayisi = bakimlar.filter(b => b.durum === 'Açık').length;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', userSelect: 'none'}}>
      
      {/* ÜST GÖSTERGE VE ACİL BUTON */}
      <div style={{display: 'flex', gap: '20px'}}>
        
        {/* KRİTİK DURUM KARTI (Eğer kritik arıza varsa kırmızı yanıp söner) */}
        <div style={{flex: 1, backgroundColor: kritikSayisi > 0 ? '#fef2f2' : theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `2px solid ${kritikSayisi > 0 ? theme.danger : theme.border}`, boxShadow: theme.shadow, display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: kritikSayisi > 0 ? 'pulse-red 2s infinite' : 'none'}}>
          <div>
            <h3 style={{margin: 0, color: kritikSayisi > 0 ? theme.danger : theme.textMuted, fontSize: '14px', textTransform: 'uppercase'}}>Kritik Alarm Durumu</h3>
            <div style={{fontSize: '32px', fontWeight: '900', color: kritikSayisi > 0 ? theme.danger : theme.textMain}}>{kritikSayisi > 0 ? `${kritikSayisi} KRİTİK ARIZA!` : 'SİSTEM NORMAL'}</div>
          </div>
          <AlertOctagon size={48} color={kritikSayisi > 0 ? theme.danger : theme.success} />
        </div>

        <div style={{flex: 1, backgroundColor: theme.cardBg, padding: '24px', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div>
             <h3 style={{margin: 0, color: theme.textMuted, fontSize: '14px', textTransform: 'uppercase'}}>Açık Arıza Kayıtları</h3>
             <div style={{fontSize: '32px', fontWeight: '900', color: theme.textMain}}>{acikSayisi} Adet</div>
          </div>
          <Activity size={48} color={theme.primary} />
        </div>

        {/* ACİL ARIZA BİLDİR BUTONU */}
        <div style={{flex: 1, display: 'flex'}}>
          <button onClick={() => setArizaModalAcik(true)} style={{flex: 1, backgroundColor: theme.danger, color: 'white', border: 'none', borderRadius: theme.radiusCard, boxShadow: '0 10px 15px -3px rgba(239,68,68,0.3)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'transform 0.1s'}}>
            <AlertOctagon size={36}/>
            <span style={{fontSize: '20px', fontWeight: '900', letterSpacing: '1px'}}>ACİL ARIZA BİLDİR</span>
          </button>
        </div>
      </div>

      {/* BAKIM LİSTESİ */}
      {hataMesaji && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
          {hataMesaji}
        </div>
      )}
      <div style={{backgroundColor: theme.cardBg, borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, overflowX: 'auto'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px'}}>
          <thead>
            <tr style={{backgroundColor: '#f8fafc', borderBottom: `2px solid ${theme.border}`}}>
              {['Kayıt', 'Makine Kodu', 'Kısım / Bölge', 'Arıza / İşlem', 'Öncelik', 'Durum', 'Personel', 'Fotoğraf', 'Notlar', 'Aksiyon'].map(h => <th key={h} style={{padding: '16px 20px', color: theme.textMuted, fontSize: '12px', fontWeight: '800', textTransform: 'uppercase'}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="10" style={{padding: '30px', textAlign: 'center'}}>Sistem Taranıyor...</td></tr> : 
              bakimlar.length === 0 ? <tr><td colSpan="10" style={{padding: '30px', textAlign: 'center', color: theme.textMuted}}>Harika! Açık bir arıza kaydı bulunmuyor.</td></tr> :
              bakimlar.map((b) => (
              <tr key={b.id} style={{borderBottom: `1px solid ${theme.border}`, backgroundColor: b.oncelik === 'KRİTİK' && b.durum !== 'Çözüldü' ? '#fef2f2' : 'white'}}>
                <td style={{padding: '16px 20px', fontWeight: '800', color: theme.textMuted}}>BKM-{b.id}</td>
                <td style={{padding: '16px 20px', color: theme.primary, fontWeight: '800', fontSize: '14px'}}>{b.makine_kodu}</td>
                <td style={{padding: '16px 20px', color: theme.textMain, fontSize: '13px'}}>{b.kisim}</td>
                <td style={{padding: '16px 20px', color: theme.textMain, fontWeight: '600', fontSize: '14px'}}>{b.islem}</td>
                <td style={{padding: '16px 20px'}}>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', color: 'white', backgroundColor: b.oncelik === 'KRİTİK' ? theme.danger : b.oncelik === 'Yüksek' ? theme.accent : '#94a3b8' }}>{b.oncelik}</span>
                </td>
                <td style={{padding: '16px 20px'}}>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', border: '1px solid', backgroundColor: b.durum === 'Çözüldü' ? '#dcfce3' : b.durum === 'Müdahale Ediliyor' ? '#fef9c3' : '#f1f5f9', color: b.durum === 'Çözüldü' ? '#16a34a' : b.durum === 'Müdahale Ediliyor' ? '#ca8a04' : '#64748b', borderColor: b.durum === 'Çözüldü' ? '#bbf7d0' : b.durum === 'Müdahale Ediliyor' ? '#fef08a' : '#cbd5e1' }}>{b.durum}</span>
                </td>
                <td style={{padding: '16px 20px', color: theme.textMain, fontSize: '13px'}}>{b.personel}<br/><span style={{fontSize: '11px', color: theme.textMuted}}>{b.tarih}</span></td>
                <td style={{padding: '16px 20px'}}>
                  {b.foto_url ? (
                    <button onClick={() => setTamEkranFoto(`${API_BASE_URL}/${b.foto_url.replace(/\\/g, '/')}`)} style={{background: 'none', border: 'none', cursor: 'zoom-in', display: 'flex', alignItems: 'center', gap: '5px', color: theme.primary, fontWeight: 'bold'}}><ImageIcon size={16}/> Görsel</button>
                  ) : <span style={{color: theme.textMuted, fontSize: '12px'}}>Yok</span>}
                </td>
                <td style={{padding: '16px 20px', color: theme.textMuted, fontSize: '13px'}}>{b.notlar || '-'}</td>
                <td style={{padding: '16px 20px'}}>
                  <button onClick={() => islemSecAc(b)} style={{backgroundColor: theme.primary, color: 'white', border: 'none', padding: '8px 16px', borderRadius: theme.radiusBtn, fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}><Wrench size={14}/> Müdahale</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL: YENİ ARIZA BİLDİRİMİ */}
      {arizaModalAcik && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)'}}>
          <div style={{backgroundColor: theme.cardBg, padding: '30px', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3 style={{margin: 0, color: theme.danger, display: 'flex', alignItems: 'center', gap: '10px'}}><AlertOctagon/> Yeni Arıza Bildirimi</h3>
              <button onClick={() => setArizaModalAcik(false)} style={{background: 'transparent', border: 'none', cursor: 'pointer'}}><X size={24}/></button>
            </div>
            <form onSubmit={arizaBildir} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <input type="text" placeholder="Makine Kodu (Örn: CNC-01)" value={yeniAriza.makine_kodu} onChange={e=>setYeniAriza({...yeniAriza, makine_kodu: e.target.value})} style={{padding: '12px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', fontWeight: 'bold'}} required/>
              <input type="text" placeholder="Arızalı Kısım (Örn: Hidrolik Pompa)" value={yeniAriza.kisim} onChange={e=>setYeniAriza({...yeniAriza, kisim: e.target.value})} style={{padding: '12px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none'}} required/>
              <textarea placeholder="Arıza Detayı / Şikayet..." value={yeniAriza.islem} onChange={e=>setYeniAriza({...yeniAriza, islem: e.target.value})} rows="3" style={{padding: '12px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', fontFamily: theme.font}} required></textarea>
              <div>
                <label style={{fontSize: '13px', fontWeight: 'bold', color: theme.textMuted}}>Arıza Önceliği</label>
                <select value={yeniAriza.oncelik} onChange={e=>setYeniAriza({...yeniAriza, oncelik: e.target.value})} style={{width: '100%', padding: '12px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', marginTop: '5px', fontWeight: 'bold', color: yeniAriza.oncelik === 'KRİTİK' ? theme.danger : theme.textMain}}>
                  <option value="Normal">Normal (Planlı Bakım Bekleyebilir)</option>
                  <option value="Yüksek">Yüksek (Üretimi Yavaşlatıyor)</option>
                  <option value="KRİTİK">KRİTİK (ÜRETİM DURDU!)</option>
                </select>
              </div>
              <button type="submit" style={{padding: '16px', backgroundColor: theme.danger, color: 'white', border: 'none', borderRadius: theme.radiusBtn, fontWeight: '900', fontSize: '16px', cursor: 'pointer', marginTop: '10px'}}>SİSTEME ALARM GÖNDER</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MÜDAHALE VE FOTOĞRAF YÜKLEME */}
      {guncellemeModalAcik && seciliBakim && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          <div style={{backgroundColor: theme.cardBg, padding: '30px', borderRadius: '16px', width: '100%', maxWidth: '450px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}><h3 style={{margin: 0}}>Arızaya Müdahale Et</h3><button onClick={() => setGuncellemeModalAcik(false)} style={{background: 'transparent', border: 'none', cursor: 'pointer'}}><X size={24}/></button></div>
            <div style={{backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: `1px solid ${theme.border}`}}>
              <div style={{fontSize: '12px', color: theme.textMuted, fontWeight: 'bold'}}>MAKİNE: {seciliBakim.makine_kodu}</div>
              <div style={{fontSize: '16px', color: theme.textMain, fontWeight: '800'}}>{seciliBakim.islem}</div>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <select value={yeniDurum} onChange={(e) => setYeniDurum(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: theme.radiusBtn, fontWeight: 'bold'}}>
                <option value="Açık">Açık (Müdahale Bekliyor)</option><option value="Müdahale Ediliyor">Müdahale Ediliyor (Parça vs. Bekleniyor)</option><option value="Çözüldü">Çözüldü (Makine Devrede)</option>
              </select>
              <textarea value={yeniNot} onChange={(e) => setYeniNot(e.target.value)} rows="3" placeholder="Yapılan işlemi veya eksik parçayı yazınız..." style={{width: '100%', padding: '12px', borderRadius: theme.radiusBtn, fontFamily: theme.font}}></textarea>
              
              {/* HASAR FOTOĞRAFI YÜKLEME */}
              <label style={{backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${theme.primary}`, cursor: 'pointer'}}>
                <span style={{display: 'flex', alignItems: 'center', gap: '8px', color: theme.primary, fontWeight: 'bold'}}>
                  {fotoYukleniyor ? <Activity size={18} className="spin"/> : <Camera size={18}/>}
                  {fotoYukleniyor ? 'Yükleniyor...' : 'Arıza Fotoğrafı Çek / Yükle'}
                </span>
                <input type="file" accept="image/*" onChange={fotoYukle} style={{display: 'none'}} disabled={fotoYukleniyor} />
              </label>

              <button onClick={bakimGuncelle} style={{width: '100%', padding: '14px', backgroundColor: theme.primary, color: 'white', border: 'none', borderRadius: theme.radiusBtn, fontWeight: 'bold', cursor: 'pointer', fontSize: '15px'}}>Kayıtları Güncelle</button>
            </div>
          </div>
        </div>
      )}

      {/* TAM EKRAN FOTOĞRAF (LIGHTBOX) */}
      {tamEkranFoto && (
        <div onClick={() => setTamEkranFoto(null)} style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'zoom-out'}}>
          <button onClick={() => setTamEkranFoto(null)} style={{position: 'absolute', top: '30px', right: '30px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '10px'}}><X size={40}/></button>
          <img src={tamEkranFoto} alt="Arıza Görüntüsü" style={{maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 0 30px rgba(0,0,0,0.8)'}} />
        </div>
      )}
      <UnimakConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel}
      />
      <UnimakToast open={toastState.open} message={toastState.message} variant={toastState.variant} toastId={toastState.id} durationMs={toastState.durationMs} onClose={dismissToast} />
    </div>
  );
}

export default FabrikaBakim;