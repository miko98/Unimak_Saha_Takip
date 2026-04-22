import React, { useState, useEffect } from 'react';
import { CheckCircle, FileText } from 'lucide-react';
import { theme } from '../theme';
import { API_BASE_URL } from '../config';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

function PanoTakip() {
  // --- VERİ DURUMLARI ---
  const [projeler, setProjeler] = useState([]);
  const [seciliProjeId, setSeciliProjeId] = useState('');
  
  const [panolar, setPanolar] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toastState, showToast, dismissToast } = useUnimakToast();

  // YENİ PANO FORMU İÇİN STATE
  const [yeniPano, setYeniPano] = useState({
    grubu: 'ELEKTRİK DEVRE ŞEMASI', panoNo: '', olcu: '', toplayan: '', baslangic: '', bitis: '', teslim: '', not: '', durumu: 'Planlandı'
  });

  // ==============================================================
  // 1. PROJELERİ VERİTABANINDAN ÇEKME
  // ==============================================================
  const fetchProjeler = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/projeler/`);
      const data = await response.json();
      const aktifProjeler = data.filter(p => p.durum === 'Aktif');
      setProjeler(aktifProjeler);
      if (aktifProjeler.length > 0 && !seciliProjeId) {
        setSeciliProjeId(aktifProjeler[0].id.toString());
      }
    } catch (error) { console.error("Proje API Hatası:", error); }
  };

  // ==============================================================
  // 2. PANOLARI VERİTABANINDAN ÇEKME
  // ==============================================================
  const fetchPanolar = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/panolar/`);
      const data = await response.json();
      setPanolar(data.reverse()); // En son eklenen en üstte
      setLoading(false);
    } catch (error) { console.error("Pano API Hatası:", error); }
  };

  useEffect(() => {
    fetchProjeler();
    fetchPanolar();
    const interval = setInterval(fetchPanolar, 5000); // Tabloyu canlı tut
    return () => clearInterval(interval);
  }, []);

  // ==============================================================
  // 3. YENİ PANOYU PYTHON'A GÖNDERME
  // ==============================================================
  const handlePanoChange = (e) => setYeniPano({...yeniPano, [e.target.name]: e.target.value});
  
  const panoKaydet = async () => {
    if(!yeniPano.panoNo) {
      showToast('Lutfen Pano No giriniz.', 'info');
      return;
    }
    if(!seciliProjeId) {
      showToast('Lutfen ustten bir proje seciniz.', 'info');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('project_id', seciliProjeId); // PANONUN HANGİ PROJEYE AİT OLDUĞU
      formData.append('grubu', yeniPano.grubu);
      formData.append('pano_no', yeniPano.panoNo);
      formData.append('olcu', yeniPano.olcu);
      formData.append('toplayan', yeniPano.toplayan);
      formData.append('baslangic', yeniPano.baslangic);
      formData.append('teslim', yeniPano.teslim);
      formData.append('notlar', yeniPano.not);
      formData.append('durumu', yeniPano.durumu);

      await fetch(`${API_BASE_URL}/yeni_pano/`, { method: 'POST', body: formData });
      
      // Kayıt başarılıysa formu temizle ve listeyi güncelle
      setYeniPano({ grubu: 'ELEKTRİK DEVRE ŞEMASI', panoNo: '', olcu: '', toplayan: '', baslangic: '', bitis: '', teslim: '', not: '', durumu: 'Planlandı' });
      fetchPanolar(); 
    } catch {
      showToast('Pano kaydedilirken sunucu hatasi olustu.', 'error');
    }
  };

  // ==============================================================
  // 4. PANOLARI SADECE SEÇİLİ PROJEYE GÖRE LİSTELE
  // ==============================================================
  const filtrelenmisPanolar = panolar.filter(p => p.project_id && p.project_id.toString() === seciliProjeId);

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', userSelect: 'none'}}>
      
      {/* ÜST FİLTRE ÇUBUĞU (DİNAMİK PROJE SEÇİMİ) */}
      <div style={{backgroundColor: theme.cardBg, padding: '16px 24px', borderRadius: theme.radiusCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${theme.border}`, boxShadow: theme.shadow}}>
         <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span style={{fontWeight: '800', color: theme.textMain, fontSize: '14px'}}>Durum:</span>
              <select style={{padding: '8px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', color: theme.textMain}}>
                <option>Aktif Projeler</option>
              </select>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span style={{fontWeight: '800', color: theme.textMain, fontSize: '14px'}}>Proje:</span>
              <select value={seciliProjeId} onChange={(e) => setSeciliProjeId(e.target.value)} style={{padding: '8px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`, outline: 'none', minWidth: '300px', fontWeight: 'bold', color: theme.primary}}>
                {projeler.length === 0 ? (
                  <option value="">Sistemde Aktif Proje Yok</option>
                ) : (
                  projeler.map(p => <option key={p.id} value={p.id}>{p.kod} - {p.name}</option>)
                )}
              </select>
            </div>
         </div>
         <button style={{backgroundColor: theme.danger, color: 'white', border: 'none', padding: '10px 16px', borderRadius: theme.radiusBtn, fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'}}>
           <FileText size={16}/> Özet PDF Raporu
         </button>
      </div>

      {/* VERİ GİRİŞ VE LİSTELEME TABLOSU */}
      <div style={{backgroundColor: theme.cardBg, borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, overflowX: 'auto'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px'}}>
          <thead>
            <tr style={{backgroundColor: '#f8fafc', borderBottom: `2px solid ${theme.border}`}}>
              {['Grubu', 'Pano No', 'Ölçüsü', 'Toplayan', 'Başlangıç', 'Teslim', 'Not', 'Durumu', 'İşlem'].map(h => (
                <th key={h} style={{padding: '16px', color: theme.textMuted, fontSize: '12px', fontWeight: '800', textTransform: 'uppercase'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            
            {/* YENİ KAYIT FORMU */}
            <tr style={{borderBottom: `2px solid ${theme.border}`, backgroundColor: '#f0fdf4'}}>
              <td style={{padding: '12px'}}><input name="grubu" value={yeniPano.grubu} onChange={handlePanoChange} style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input name="panoNo" value={yeniPano.panoNo} onChange={handlePanoChange} placeholder="Örn: PN-001" style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', backgroundColor: 'white', fontWeight: 'bold', color: theme.primary, outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input name="olcu" value={yeniPano.olcu} onChange={handlePanoChange} placeholder="Örn: 200x80" style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input name="toplayan" value={yeniPano.toplayan} onChange={handlePanoChange} placeholder="Personel" style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input type="date" name="baslangic" value={yeniPano.baslangic} onChange={handlePanoChange} style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input type="date" name="teslim" value={yeniPano.teslim} onChange={handlePanoChange} style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}><input name="not" value={yeniPano.not} onChange={handlePanoChange} placeholder="Notlar..." style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', outline: 'none'}}/></td>
              <td style={{padding: '12px'}}>
                <select name="durumu" value={yeniPano.durumu} onChange={handlePanoChange} style={{width: '100%', padding: '8px', border: `1px solid ${theme.border}`, borderRadius: '4px', fontWeight: 'bold', outline: 'none'}}>
                  <option>Planlandı</option><option>Devam Ediyor</option><option>Tamamlandı</option>
                </select>
              </td>
              <td style={{padding: '12px', textAlign: 'center'}}>
                <button onClick={panoKaydet} style={{backgroundColor: theme.success, color: 'white', border: 'none', padding: '8px 16px', borderRadius: theme.radiusBtn, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: '0 auto'}}>
                  <CheckCircle size={14}/> Kaydet
                </button>
              </td>
            </tr>

            {/* SEÇİLİ PROJEYE AİT EKLENMİŞ PANOLARIN LİSTESİ */}
            {loading ? (
               <tr><td colSpan="9" style={{padding: '24px', textAlign: 'center', color: theme.textMuted}}>Veritabanı kontrol ediliyor...</td></tr>
            ) : filtrelenmisPanolar.length === 0 ? (
              <tr><td colSpan="9" style={{padding: '24px', textAlign: 'center', color: theme.textMuted}}>Bu projeye ait henüz bir pano kaydı eklenmedi. Üstteki formdan ekleyebilirsiniz.</td></tr>
            ) : filtrelenmisPanolar.map((pano, i) => (
              <tr key={i} style={{borderBottom: `1px solid ${theme.border}`, backgroundColor: 'white'}}>
                <td style={{padding: '16px', color: theme.textMain, fontSize: '13px', fontWeight: '600'}}>{pano.grubu}</td>
                <td style={{padding: '16px', color: theme.primary, fontWeight: '800', fontSize: '13px'}}>
                  <span style={{backgroundColor: '#eff6ff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bfdbfe'}}>{pano.pano_no}</span>
                </td>
                <td style={{padding: '16px', color: theme.textMain, fontSize: '13px'}}>{pano.olcu}</td>
                <td style={{padding: '16px', color: theme.textMain, fontSize: '13px'}}>{pano.toplayan}</td>
                <td style={{padding: '16px', color: theme.textMuted, fontSize: '13px'}}>{pano.baslangic}</td>
                <td style={{padding: '16px', color: theme.textMuted, fontSize: '13px'}}>{pano.teslim}</td>
                <td style={{padding: '16px', color: theme.textMuted, fontSize: '13px'}}>{pano.notlar || '-'}</td>
                <td style={{padding: '16px'}}>
                   <span style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', border: '1px solid',
                      backgroundColor: pano.durumu === 'Tamamlandı' ? '#dcfce3' : pano.durumu === 'Devam Ediyor' ? '#fef9c3' : '#f1f5f9',
                      color: pano.durumu === 'Tamamlandı' ? '#16a34a' : pano.durumu === 'Devam Ediyor' ? '#ca8a04' : '#64748b',
                      borderColor: pano.durumu === 'Tamamlandı' ? '#bbf7d0' : pano.durumu === 'Devam Ediyor' ? '#fef08a' : '#cbd5e1'
                    }}>
                      {pano.durumu}
                    </span>
                </td>
                <td style={{padding: '16px', textAlign: 'center'}}>
                  <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                    <button style={{backgroundColor: '#fef08a', color: '#a16207', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px'}}>Mail</button>
                    <button style={{backgroundColor: '#25D366', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px'}}>WP</button>
                  </div>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>
      <UnimakToast open={toastState.open} message={toastState.message} variant={toastState.variant} toastId={toastState.id} durationMs={toastState.durationMs} onClose={dismissToast} />
    </div>
  );
}

export default PanoTakip;