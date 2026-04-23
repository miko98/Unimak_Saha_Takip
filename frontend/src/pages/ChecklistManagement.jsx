import React, { useState, useEffect } from 'react';
import { 
  Zap, FileText, FileSpreadsheet, Upload, Activity,
  CheckCircle, AlertTriangle, Clock, Trash2, PieChart as PieChartIcon, Filter,
  BellRing, Send, Mail, X // YENİ İKONLAR EKLENDİ
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchJson } from '../api/http';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

function ChecklistManagement({ kullanici }) {
  const loadXlsx = async () => import('xlsx');
  const loadJsPdf = async () => {
    const [{ default: JsPDF }, _autotable] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    return JsPDF;
  };

  const [projeler, setProjeler] = useState([]);
  const [seciliProjeId, setSeciliProjeId] = useState('');
  const [checklistItems, setChecklistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hataMesaji, setHataMesaji] = useState('');
  const [excelYukleniyor, setExcelYukleniyor] = useState(false);
  const [pdfHazirlaniyor, setPdfHazirlaniyor] = useState(false);
  const [sablonHazirlaniyor, setSablonHazirlaniyor] = useState(false);
  const [manuelEkleniyor, setManuelEkleniyor] = useState(false);
  const [seciliPersonel, setSeciliPersonel] = useState('Tümü');
  const [yeniMaddeMetni, setYeniMaddeMetni] = useState('');
  const [yeniMaddeKategori, setYeniMaddeKategori] = useState('Elektrik');

  // YENİ: SOS (ACİL DURUM) MODAL STATE'LERİ
  const [sosModalAcik, setSosModalAcik] = useState(false);
  const [sosModalScrollY, setSosModalScrollY] = useState(0);
  const [sosDepartman, setSosDepartman] = useState('Proje Yöneticisi');
  const [sosMesaj, setSosMesaj] = useState('');
  const [sosIslemde, setSosIslemde] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();

  // --- VERİTABANI BAĞLANTILARI ---
  const requestJson = (url, options) => fetchJson(url, options);

  const fetchProjeler = async () => {
    try {
      const data = await requestJson('/is_emri_kayitlari/');
      const safe = Array.isArray(data) ? data : [];
      const aktifler = safe.filter(p => p.durum !== 'Tamamlandı');
      setProjeler(aktifler);
      if (aktifler.length > 0 && !seciliProjeId) setSeciliProjeId(aktifler[0].id.toString());
      setHataMesaji('');
    } catch (error) {
      console.error(error);
      setProjeler([]);
      setHataMesaji(error.message || 'Projeler alınamadı.');
    }
  };

  const fetchChecklist = async () => {
    if (!seciliProjeId) return;
    setLoading(true);
    try {
      const data = await requestJson(`/checklist/${seciliProjeId}`);
      setChecklistItems(Array.isArray(data) ? data : []);
      setHataMesaji('');
    } catch (error) {
      console.error(error);
      setChecklistItems([]);
      setHataMesaji(error.message || 'Checklist verisi alınamadı.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchProjeler(); }, []);
  useEffect(() => { fetchChecklist(); setSeciliPersonel('Tümü'); }, [seciliProjeId]);

  // --- AKSİYONLAR ---
  const durumGuncelle = async (id, yeniDurum, maddeMetni = '', secimli = {}) => {
    const skipConfirm = Boolean(secimli?.skipConfirm);
    if (!skipConfirm) return false;
    try {
      const formData = new FormData();
      formData.append('item_id', id); formData.append('durum', yeniDurum); formData.append('personel', kullanici?.isim || 'Yönetici');
      await requestJson('/checklist/guncelle/', { method: 'POST', body: formData });
      fetchChecklist(); 
      return true;
    } catch (error) {
      showToast(`Guncelleme basarisiz: ${error.message}`, 'error');
    }
    return false;
  };

  const checklistMaddeSil = async (id) => {
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Checklist maddesi kalici olarak silinecek. Devam edilsin mi?',
      variant: 'danger',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        try {
          const formData = new FormData(); formData.append('item_id', id);
          await requestJson('/checklist_sil/', { method: 'POST', body: formData });
          fetchChecklist();
        } catch (error) {
          showToast(`Madde silinemedi: ${error.message}`, 'error');
        }
      },
    });
  };

  const excelYukle = async (e) => {
    const file = e.target.files[0];
    if (!file || !seciliProjeId) return;
    setExcelYukleniyor(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          const formData = new FormData();
          formData.append('project_id', seciliProjeId); formData.append('madde_metni', data[i][0]); formData.append('kategori', 'Elektrik');
          await requestJson('/yeni_checklist_maddesi/', { method: 'POST', body: formData });
        }
      }
      showToast('Liste basariyla yuklendi.', 'success');
      setExcelYukleniyor(false);
      fetchChecklist();
    };
    reader.readAsBinaryString(file); e.target.value = null;
  };

  const manuelMaddeEkle = async () => {
    const metin = yeniMaddeMetni.trim();
    if (!seciliProjeId) {
      showToast('Lutfen once proje secin.', 'info');
      return;
    }
    if (!metin) {
      showToast('Lutfen madde metni girin.', 'info');
      return;
    }
    setManuelEkleniyor(true);
    try {
      const formData = new FormData();
      formData.append('project_id', seciliProjeId);
      formData.append('madde_metni', metin);
      formData.append('kategori', yeniMaddeKategori);
      await requestJson('/yeni_checklist_maddesi/', { method: 'POST', body: formData });
      setYeniMaddeMetni('');
      fetchChecklist();
    } catch (error) {
      showToast(`Madde eklenemedi: ${error.message}`, 'error');
    } finally {
      setManuelEkleniyor(false);
    }
  };

  const indirPDF = async () => {
    if (pdfHazirlaniyor) return;
    if (!aktifProjeObje) {
      showToast('Once bir proje secin.', 'info');
      return;
    }
    setPdfHazirlaniyor(true);
    try {
      const JsPDF = await loadJsPdf();
      const doc = new JsPDF();
      const raporTarihi = new Date().toLocaleString('tr-TR');
      const satirlar = checklistItems.map((item, i) => [
        i + 1,
        item.kategori || '-',
        item.madde_metni || '-',
        item.durum || 'Beklemede',
        item.guncelleyen || '-',
      ]);
      doc.setFontSize(14);
      doc.text(`UNIMAK Checklist Raporu - ${aktifProjeObje.kod}`, 14, 16);
      doc.setFontSize(10);
      doc.text(`Proje: ${aktifProjeObje.kod} - ${aktifProjeObje.name || ''}`, 14, 23);
      doc.text(`Tarih: ${raporTarihi}`, 14, 29);
      doc.autoTable({
        startY: 35,
        head: [['SN', 'Kategori', 'Madde', 'Durum', 'Güncelleyen']],
        body: satirlar.length ? satirlar : [['-', '-', 'Kayıt yok', '-', '-']],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59] },
        theme: 'grid',
      });
      doc.save(`${aktifProjeObje.kod}_checklist.pdf`);
      showToast('Checklist PDF hazirlandi.', 'success');
    } catch {
      showToast('Checklist PDF olusturulamadi.', 'error');
    } finally {
      setPdfHazirlaniyor(false);
    }
  };

  const indirSablon = async () => {
    if (sablonHazirlaniyor) return;
    setSablonHazirlaniyor(true);
    try {
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet([
        ['madde_metni'],
        ['Kablo etiketleri kontrol edildi'],
        ['Pano içi sıkılık kontrolü yapıldı'],
        ['Topraklama bağlantıları doğrulandı'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Checklist');
      XLSX.writeFile(wb, 'checklist_sablon.xlsx');
      showToast('Checklist sablonu indirildi.', 'success');
    } catch {
      showToast('Sablon indirme basarisiz.', 'error');
    } finally {
      setSablonHazirlaniyor(false);
    }
  };

  // ==============================================================
  // YENİ: ACİL DURUM (SOS) FONKSİYONLARI
  // ==============================================================
  const aktifProjeObje = projeler.find(p => p.id.toString() === seciliProjeId);

  const sosWhatsAppGonder = () => {
    if (!sosMesaj) {
      showToast('Lutfen bir hata detayi yazin.', 'info');
      return;
    }
    const wpMesaj = `🚨 *UNIMAK ACİL DURUM BİLDİRİMİ* 🚨%0A%0A*Proje:* ${aktifProjeObje?.kod} - ${aktifProjeObje?.name}%0A*İlgili Birim:* ${sosDepartman}%0A*Bildiren:* ${kullanici?.isim || 'Saha Personeli'}%0A%0A*Hata/İhtiyaç Detayı:*%0A${sosMesaj}`;
    
    // WhatsApp Web veya Mobili açar
    window.open(`https://wa.me/?text=${wpMesaj}`, '_blank');
    setSosModalAcik(false);
    setSosModalScrollY(0);
    setSosMesaj('');
  };

  const sosMailGonder = async () => {
    if (!sosMesaj) {
      showToast('Lutfen bir hata detayi yazin.', 'info');
      return;
    }
    setSosIslemde(true);
    try {
      const formData = new FormData();
      formData.append('proje_bilgisi', `${aktifProjeObje?.kod} - ${aktifProjeObje?.name}`);
      formData.append('hata_detayi', sosMesaj);
      formData.append('gonderen', kullanici?.isim || 'Saha Personeli');
      
      // Departmana göre temsili mail adresleri (Burayı kendi şirket maillerinle değiştirebilirsin)
      let mail = "yonetim@unimak.com";
      if (sosDepartman === 'Satın Alma / Depo') mail = "depo@unimak.com";
      if (sosDepartman === 'Elektrik Şefi') mail = "elektrik@unimak.com";
      formData.append('alici_mail', mail);

      await requestJson('/acil_durum_bildir/', { method: 'POST', body: formData });
      showToast('Acil durum e-postasi basariyla gonderildi.', 'success');
      setSosModalAcik(false);
      setSosModalScrollY(0);
      setSosMesaj('');
    } catch {
      showToast('Mail gonderilirken hata olustu.', 'error');
    } finally {
      setSosIslemde(false);
    }
  };


  // --- VERİ ANALİZİ ---
  const tamamlananlar = checklistItems.filter((item) => item.durum === 'Tamamlandı');
  const hatalilar = checklistItems.filter((item) => item.durum === 'Hatalı');
  const bekleyenler = checklistItems.filter((item) => item.durum === 'Beklemede');
  const mudahaleEdilenler = checklistItems.filter(item => item.durum === 'Tamamlandı' || item.durum === 'Hatalı');
  const personelIstatistik = mudahaleEdilenler.reduce((acc, item) => { const kisi = item.guncelleyen || 'Bilinmeyen Personel'; acc[kisi] = (acc[kisi] || 0) + 1; return acc; }, {});
  const pieData = Object.keys(personelIstatistik).map(kisi => ({ name: kisi, value: personelIstatistik[kisi] }));
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const detayliTabloVerisi = seciliPersonel === 'Tümü' ? mudahaleEdilenler : mudahaleEdilenler.filter(item => (item.guncelleyen || 'Bilinmeyen Personel') === seciliPersonel);
  const tamamlanmaYuzdesi = checklistItems.length === 0 ? 0 : Math.round((tamamlananlar.length / checklistItems.length) * 100);
  const tamamlananOran = checklistItems.length === 0 ? 0 : (tamamlananlar.length / checklistItems.length) * 100;
  const hataliOran = checklistItems.length === 0 ? 0 : (hatalilar.length / checklistItems.length) * 100;
  const beklemedeOran = checklistItems.length === 0 ? 0 : (bekleyenler.length / checklistItems.length) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', flex: 1, backgroundColor: '#f8fafc', padding: '30px', boxSizing: 'border-box', overflowY: 'auto' }}>
      
      {/* ÜST BAŞLIK */}
      {hataMesaji && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
          {hataMesaji}
        </div>
      )}
      <div style={{ backgroundColor: 'white', padding: '25px 35px', borderRadius: '15px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ backgroundColor: '#eff6ff', padding: '15px', borderRadius: '12px' }}><Zap size={30} color="#3b82f6" fill="#3b82f6" fillOpacity={0.2} /></div>
          <div>
            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '24px', fontWeight: '900' }}>Elektrik Montaj Kontrol Listesi</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ color: '#64748b', fontSize: '14px', fontWeight: '600' }}>Proje:</span>
              <select value={seciliProjeId} onChange={(e) => setSeciliProjeId(e.target.value)} style={{ border: 'none', background: 'none', color: '#64748b', fontWeight: '700', fontSize: '14px', cursor: 'pointer', outline: 'none' }}>
                {projeler.map(p => <option key={p.id} value={p.id}>{p.kod} - {p.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          
          {/* YENİ: SOS BUTONU */}
          <button onClick={() => { setSosModalScrollY(window.scrollY || 0); setSosModalAcik(true); }} style={{ backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '12px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginRight: '15px', transition: 'all 0.2s' }}>
            <BellRing size={18} className="shake-animation"/> Hata / Acil Bildirim
          </button>

          <button disabled={pdfHazirlaniyor} onClick={indirPDF} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: '700', cursor: pdfHazirlaniyor ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: pdfHazirlaniyor ? 0.75 : 1 }}><FileText size={18}/> {pdfHazirlaniyor ? 'Rapor Hazirlaniyor...' : 'Checklist PDF'}</button>
          <button disabled={sablonHazirlaniyor} onClick={indirSablon} style={{ backgroundColor: '#0f766e', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', fontWeight: '700', cursor: sablonHazirlaniyor ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: sablonHazirlaniyor ? 0.75 : 1 }}><FileSpreadsheet size={18}/> {sablonHazirlaniyor ? 'Sablon Hazirlaniyor...' : 'Şablon İndir'}</button>
          <label style={{ backgroundColor: '#3b82f6', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {excelYukleniyor ? <Activity size={18} className="spin"/> : <Upload size={18}/>} Excel Yükle
            <input type="file" hidden onChange={excelYukle} accept=".xlsx, .xls" disabled={excelYukleniyor} />
          </label>
        </div>
      </div>

      {/* İLERLEME ÇUBUĞU */}
      <div style={{backgroundColor: 'white', padding: '20px 35px', borderRadius: '15px', border: `1px solid #e2e8f0`, flexShrink: 0, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontWeight: '800', color: '#1e293b'}}>
          <span>Kontrol İlerleme Durumu</span>
          <span style={{color: tamamlanmaYuzdesi === 100 ? '#10b981' : '#3b82f6'}}>% {tamamlanmaYuzdesi} ({tamamlananlar.length} / {checklistItems.length})</span>
        </div>
        <div style={{width: '100%', backgroundColor: '#e2e8f0', height: '12px', borderRadius: '6px', overflow: 'hidden', display: 'flex'}}>
          <div style={{height: '100%', backgroundColor: '#10b981', width: `${tamamlananOran}%`, transition: 'width 0.5s ease-in-out'}}></div>
          <div style={{height: '100%', backgroundColor: '#ef4444', width: `${hataliOran}%`, transition: 'width 0.5s ease-in-out'}}></div>
          <div style={{height: '100%', backgroundColor: '#94a3b8', width: `${beklemedeOran}%`, transition: 'width 0.5s ease-in-out'}}></div>
        </div>
        <div style={{display: 'flex', gap: '16px', marginTop: '10px', fontSize: '12px', fontWeight: '700', color: '#475569'}}>
          <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}><span style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981'}}></span> Tamamlandı ({tamamlananlar.length})</span>
          <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}><span style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444'}}></span> Hatalı ({hatalilar.length})</span>
          <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}><span style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#94a3b8'}}></span> Beklemede ({bekleyenler.length})</span>
        </div>
      </div>

      {/* MANUEL HIZLI EKLEME */}
      <div style={{ backgroundColor: 'white', padding: '20px 24px', borderRadius: '15px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: '14px', fontWeight: '800', color: '#334155', marginBottom: '12px' }}>Manuel Hızlı Giriş</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', alignItems: 'center' }}>
          <input
            value={yeniMaddeMetni}
            onChange={(e) => setYeniMaddeMetni(e.target.value)}
            placeholder="Yeni checklist maddesi yazın..."
            style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            onKeyDown={(e) => { if (e.key === 'Enter') manuelMaddeEkle(); }}
          />
          <select
            value={yeniMaddeKategori}
            onChange={(e) => setYeniMaddeKategori(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '700' }}
          >
            <option value="Elektrik">Elektrik</option>
            <option value="Mekanik">Mekanik</option>
            <option value="Saha">Saha</option>
            <option value="Genel">Genel</option>
          </select>
          <button
            onClick={manuelMaddeEkle}
            disabled={manuelEkleniyor}
            style={{ backgroundColor: '#0ea5e9', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '8px', fontWeight: '800', cursor: manuelEkleniyor ? 'not-allowed' : 'pointer', opacity: manuelEkleniyor ? 0.7 : 1 }}
          >
            {manuelEkleniyor ? 'Ekleniyor...' : 'Madde Ekle'}
          </button>
        </div>
      </div>

      {/* ANA İÇERİK: LİSTE VE GRAFİK YAN YANA */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px', paddingBottom: '30px' }}>
        
        {/* SOL TARAF: CHECKLIST MADDELERİ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>Yükleniyor...</div> : 
            checklistItems.length === 0 ? <div style={{ textAlign: 'center', padding: '50px', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>Henüz madde eklenmemiş. Excel yükleyebilir veya Dashboard'dan ekleme yapabilirsiniz.</div> :
            checklistItems.map((item, idx) => (
            <div key={item.id} style={{ backgroundColor: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{fontSize: '14px', color: '#94a3b8', fontWeight: '900'}}>{idx + 1}.</span>
                <div style={{ fontSize: '14px', fontWeight: '700', color: item.durum !== 'Beklemede' ? '#94a3b8' : '#334155', textDecoration: item.durum !== 'Beklemede' ? 'line-through' : 'none' }}>
                  {item.madde_metni}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setConfirmState({
                  open: true,
                  title: 'UNIMAK ISLEM ONAYI',
                  message: `"${item.madde_metni || 'Belirtilmemis'}" maddesi TAMAMLANDI olarak isaretlenecek.`,
                  variant: 'warning',
                  onCancel: () => setConfirmState({ open: false }),
                  onConfirm: async () => { setConfirmState({ open: false }); await durumGuncelle(item.id, 'Tamamlandı', item.madde_metni, { skipConfirm: true }); },
                })} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontWeight: '800', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: item.durum === 'Tamamlandı' ? '#10b981' : 'transparent', color: item.durum === 'Tamamlandı' ? 'white' : '#64748b' }}><CheckCircle size={14}/> TAMAM</button>
                <button onClick={() => setConfirmState({
                  open: true,
                  title: 'UNIMAK HATA ONAYI',
                  message: `"${item.madde_metni || 'Belirtilmemis'}" maddesi HATALI olarak isaretlenecek.`,
                  variant: 'danger',
                  confirmText: 'Evet, Hatali Isaretle',
                  onCancel: () => setConfirmState({ open: false }),
                  onConfirm: async () => {
                    setConfirmState({ open: false });
                    const onceki = item.durum;
                    const ok = await durumGuncelle(item.id, 'Hatalı', item.madde_metni, { skipConfirm: true });
                    if (ok && onceki !== 'Hatalı') {
                      setSosMesaj(`HATA BILDIRIMI: ${item.madde_metni} isleminde hata tespit edildi.`);
                      setSosModalScrollY(window.scrollY || 0);
                      setSosModalAcik(true);
                    }
                  },
                })} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontWeight: '800', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: item.durum === 'Hatalı' ? '#ef4444' : 'transparent', color: item.durum === 'Hatalı' ? 'white' : '#64748b' }}><AlertTriangle size={14}/> HATA</button>
                <button onClick={() => setConfirmState({
                  open: true,
                  title: 'UNIMAK ISLEM ONAYI',
                  message: `"${item.madde_metni || 'Belirtilmemis'}" maddesi BEKLEMEDE olarak guncellenecek.`,
                  variant: 'warning',
                  onCancel: () => setConfirmState({ open: false }),
                  onConfirm: async () => { setConfirmState({ open: false }); await durumGuncelle(item.id, 'Beklemede', item.madde_metni, { skipConfirm: true }); },
                })} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontWeight: '800', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: item.durum === 'Beklemede' ? '#94a3b8' : 'transparent', color: item.durum === 'Beklemede' ? 'white' : '#64748b' }}><Clock size={14}/> BEKLE</button>
                <button onClick={() => checklistMaddeSil(item.id)} style={{ padding: '8px', marginLeft: '5px', borderRadius: '6px', border: `1px solid #fecaca`, backgroundColor: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* SAĞ TARAF: ANALİZ (Öncekiyle Aynı) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '15px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}><PieChartIcon size={20} color="#3b82f6"/> Saha Personeli Müdahale Analizi</h3>
            {pieData.length === 0 ? <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic' }}>Kayıt yok.</div> : ( <div style={{ height: '250px', width: '100%' }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', fontWeight: 'bold' }} /><Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }}/></PieChart></ResponsiveContainer></div> )}
          </div>

          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '15px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>İşlem Geçmişi</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '8px' }}><Filter size={14} color="#64748b"/><select value={seciliPersonel} onChange={(e) => setSeciliPersonel(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}><option value="Tümü">Tüm Personel</option>{Object.keys(personelIstatistik).map(kisi => <option key={kisi} value={kisi}>{kisi}</option>)}</select></div>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}>
              {detayliTabloVerisi.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Kayıt bulunamadı.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{detayliTabloVerisi.map(islem => ( <div key={islem.id} style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', borderLeft: `4px solid ${islem.durum === 'Tamamlandı' ? '#10b981' : '#ef4444'}` }}><div style={{ fontSize: '13px', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>{islem.madde_metni}</div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: '700' }}><span style={{ color: '#64748b' }}>{islem.guncelleyen || 'Bilinmiyor'}</span><span style={{ color: islem.durum === 'Tamamlandı' ? '#10b981' : '#ef4444' }}>{islem.durum}</span></div></div> ))}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* ACİL DURUM (SOS) MODALI */}
      {/* ============================================================== */}
      {sosModalAcik && (
         <div style={{position: 'absolute', top: 0, left: 0, width: '100%', minHeight: `${Math.max(document.body.scrollHeight, (window.innerHeight + (window.scrollY || 0)))}px`, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: `${Math.max(24, sosModalScrollY + 40)}px`, backdropFilter: 'blur(5px)'}}>
          <div style={{backgroundColor: 'white', padding: '30px', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', borderTop: '6px solid #ef4444'}}>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                <div style={{backgroundColor: '#fef2f2', padding: '12px', borderRadius: '50%'}}>
                  <BellRing size={28} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{margin: 0, color: '#1e293b', fontSize: '20px', fontWeight: '900'}}>Acil Durum Bildirimi</h3>
                  <div style={{fontSize: '13px', color: '#64748b', fontWeight: '600', marginTop: '4px'}}>Proje: {aktifProjeObje?.kod}</div>
                </div>
              </div>
              <button onClick={() => { setSosModalAcik(false); setSosModalScrollY(0); }} style={{background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><X size={18}/></button>
            </div>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              
              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px'}}>Hangi Birime Bildirilecek?</label>
                <select value={sosDepartman} onChange={(e) => setSosDepartman(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', fontSize: '14px', color: '#1e293b', backgroundColor: '#f8fafc'}}>
                  <option value="Proje Yöneticisi">Proje Yöneticisi</option>
                  <option value="Satın Alma / Depo">Satın Alma / Depo (Malzeme Eksik)</option>
                  <option value="Elektrik Şefi">Elektrik Şefi (Teknik Destek)</option>
                </select>
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px'}}>Sorun veya İhtiyaç Nedir?</label>
                <textarea 
                  value={sosMesaj} 
                  onChange={(e) => setSosMesaj(e.target.value)} 
                  rows="4" 
                  placeholder="Örn: 2 adet kontaktör eksik, acil sahaya gönderilmesi gerekiyor..." 
                  style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'inherit', resize: 'none', fontSize: '14px'}}
                ></textarea>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px'}}>
                <button onClick={() => setConfirmState({
                  open: true,
                  title: 'UNIMAK ISLEM ONAYI',
                  message: 'Acil durum mesaji WhatsApp ile gonderilecek. Devam edilsin mi?',
                  variant: 'danger',
                  confirmText: 'Evet, Gonder',
                  onCancel: () => setConfirmState({ open: false }),
                  onConfirm: () => { setConfirmState({ open: false }); sosWhatsAppGonder(); },
                })} style={{width: '100%', padding: '14px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'}}>
                  <Send size={18}/> WhatsApp'a At
                </button>
                <button onClick={() => setConfirmState({
                  open: true,
                  title: 'UNIMAK ISLEM ONAYI',
                  message: 'Acil durum bildirimi resmi e-posta ile gonderilecek. Devam edilsin mi?',
                  variant: 'danger',
                  confirmText: 'Evet, Gonder',
                  onCancel: () => setConfirmState({ open: false }),
                  onConfirm: async () => { setConfirmState({ open: false }); await sosMailGonder(); },
                })} disabled={sosIslemde} style={{width: '100%', padding: '14px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: sosIslemde ? 'not-allowed' : 'pointer', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', opacity: sosIslemde ? 0.7 : 1}}>
                  {sosIslemde ? <Activity size={18} className="spin"/> : <Mail size={18}/>} Resmi Mail Gönder
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

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

    </div>
  );
}

export default ChecklistManagement;