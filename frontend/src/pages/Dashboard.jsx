import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle, AlertTriangle, Activity, FileText, Image as ImageIcon, 
  ListChecks, Clock, FileSpreadsheet, X, PenTool, Zap, Plus, Camera, Trash2, Send, Info, Mail,
  Factory, Building2, Filter
} from 'lucide-react';
import { theme } from '../theme';
import { API_BASE_URL } from '../config';
import { fetchJsonWithFallback } from '../api/http';
import { readCache, writeCache } from '../api/localCache';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

const CACHE_TTL_FAST_MS = 60 * 1000;
const CACHE_TTL_SLOW_MS = 10 * 60 * 1000;

function Dashboard({ kullanici }) {
  const loadJsPdf = async () => {
    const [{ default: JsPDF }, _autotable] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    return JsPDF;
  };

  const [availableYears, setAvailableYears] = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [seciliYil, setSeciliYil] = useState('');
  const [seciliProjeId, setSeciliProjeId] = useState('');
  const [seciliFaz, setSeciliFaz] = useState('Tümü');
  const [isEmirleri, setIsEmirleri] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filtreler, setFiltreler] = useState({ departman: 'Tüm Departmanlar', grup: 'Tüm Gruplar', islem: 'Tüm İşlemler', durum: 'Tüm Durumlar', personel: 'Tüm Personeller' });
  const [kaynakFiltresi, setKaynakFiltresi] = useState('Tümü');

  // MODALLAR
  const [kontrolListesiAcik, setKontrolListesiAcik] = useState(false);
  const [guncellemeModalAcik, setGuncellemeModalAcik] = useState(false);
  const [detayModalAcik, setDetayModalAcik] = useState(false);
  const [galeriAcik, setGaleriAcik] = useState(false); 
  const [tamEkranFoto, setTamEkranFoto] = useState(null); 
  const [tabloFotoDetay, setTabloFotoDetay] = useState(null);
  const [islemKaydediliyor, setIslemKaydediliyor] = useState(false);

  const [seciliIslem, setSeciliIslem] = useState(null); 
  const [yeniNot, setYeniNot] = useState('');
  const [yeniDurum, setYeniDurum] = useState('');
  const [yeniAtananKisi, setYeniAtananKisi] = useState('');
  const [yeniTerminTarihi, setYeniTerminTarihi] = useState('');
  const [yeniOncelik, setYeniOncelik] = useState('Normal');

  // CHECKLIST VE GALERİ
  const [checklistItems, setChecklistItems] = useState([]);
  const [yeniMaddeGirdisi, setYeniMaddeGirdisi] = useState('');
  const [excelYukleniyor, setExcelYukleniyor] = useState(false); 
  
  const [fotograflar, setFotograflar] = useState([]); 
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false); 
  const [galeriFiltresi, setGaleriFiltresi] = useState('Tümü'); // YENİ: Galeri Filtresi
  const [raporHazirlaniyor, setRaporHazirlaniyor] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();

  /** fetchYillar async bitince eski closure ile yılı ezlememek; sadece ilk yüklemede varsayılan yıl */
  const yilIlkVarsayilanAtandiRef = useRef(false);
  /** Kullanıcı yıl seçimi yaptıysa async default atama ile ezme */
  const kullaniciYilSecimiRef = useRef(false);
  /** Yıl/proje isteklerinde geciken eski cevabı yok say */
  const fetchProjelerIstekIdRef = useRef(0);
  /** İş emri isteklerinde geciken eski cevabı yok say */
  const fetchDataIstekIdRef = useRef(0);

  const terminTarihiIsoGun = (raw) => {
    const s = (raw || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      return `${m[3]}-${mo}-${d}`;
    }
    return null;
  };

  // ==============================================================
  // 1. VERİTABANI BAĞLANTILARI
  // ==============================================================
  const yilQuery = seciliYil ? `?yil=${seciliYil}` : '';

  const fetchProjeler = async () => {
    const requestId = ++fetchProjelerIstekIdRef.current;
    try {
      const { data } = await requestJsonWithFallback([
        `/is_emri_kayitlari/${yilQuery}`,
        `/projeler/${yilQuery}`,
      ]);
      if (requestId !== fetchProjelerIstekIdRef.current) return;
      const safe = Array.isArray(data) ? data : [];
      const aktifProjeler = safe.filter(p => p.durum !== 'Tamamlandı');
      const formatliProjeler = aktifProjeler.map(p => ({
        ...p,
        durum: p.durum === 'Aktif' ? 'İç Montaj' : (p.durum === 'Nakliyat' ? 'Dış Montaj' : p.durum)
      }));
      setProjeler(formatliProjeler);
      writeCache(`dashboard_projeler_${seciliYil || 'all'}`, formatliProjeler);
      setSeciliProjeId((prev) => {
        const prevStr = prev == null ? '' : String(prev);
        if (prevStr && !formatliProjeler.some((p) => String(p.id) === prevStr)) {
          return '';
        }
        return prevStr;
      });
    } catch (error) { console.error(error); }
  };

  const fetchData = async () => {
    const requestId = ++fetchDataIstekIdRef.current;
    try {
      const { data } = await requestJsonWithFallback([`/is_emirleri/${yilQuery}`]);
      if (requestId !== fetchDataIstekIdRef.current) return;
      const safe = Array.isArray(data) ? data : [];
      const next = [...safe].reverse();
      setIsEmirleri(next);
      writeCache(`dashboard_is_emirleri_${seciliYil || 'all'}`, next);
    } catch (error) {
      console.error(error);
    } finally {
      if (requestId === fetchDataIstekIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchYillar = async () => {
    try {
      const { data } = await requestJsonWithFallback(['/meta/yillar', '/is_emri_kayitlari/', '/projeler/']);
      const yearsFromMeta = Array.isArray(data?.years) ? data.years : null;
      const fromList = [...new Set((Array.isArray(data) ? data : []).map((x) => Number(x.yil)).filter(Boolean))];
      const years = (yearsFromMeta || fromList).sort((a, b) => b - a);
      setAvailableYears(years);
      writeCache('dashboard_available_years', years);
      setSeciliYil((prev) => {
        if (!years.length) return '';
        if (prev !== '') {
          const n = Number(prev);
          if (!Number.isNaN(n) && years.includes(n)) return String(n);
          return '';
        }
        if (kullaniciYilSecimiRef.current) {
          return prev;
        }
        if (!yilIlkVarsayilanAtandiRef.current) {
          yilIlkVarsayilanAtandiRef.current = true;
          return String(years[0]);
        }
        return '';
      });
    } catch {
      // SWR: hata aninda mevcut yil listesini koru.
    }
  };

  useEffect(() => {
    const cachedYears = readCache('dashboard_available_years', [], CACHE_TTL_SLOW_MS);
    const cachedProjects = readCache('dashboard_projeler_all', [], CACHE_TTL_FAST_MS);
    const cachedWorkOrders = readCache('dashboard_is_emirleri_all', [], CACHE_TTL_FAST_MS);
    if (Array.isArray(cachedYears) && cachedYears.length > 0) {
      setAvailableYears(cachedYears);
      if (!kullaniciYilSecimiRef.current && !seciliYil) {
        yilIlkVarsayilanAtandiRef.current = true;
        setSeciliYil(String(cachedYears[0]));
      }
    }
    if (Array.isArray(cachedProjects) && cachedProjects.length > 0) {
      setProjeler(cachedProjects);
      setSeciliProjeId((prev) => prev || String(cachedProjects[0]?.id || ''));
    }
    if (Array.isArray(cachedWorkOrders) && cachedWorkOrders.length > 0) {
      setIsEmirleri(cachedWorkOrders);
      setLoading(false);
    }
    fetchYillar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchProjeler();
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [seciliYil]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==============================================================
  // 2. FAZ VE DURUM GÜNCELLEMELERİ
  // ==============================================================
  const aktifProjeObje = projeler.find(p => p.id.toString() === seciliProjeId) || {
    kod: !seciliProjeId ? (projeler.length ? 'Tümü projeler' : 'Aktif proje yok') : 'Seçim Bekleniyor',
    name: '',
    durum: 'İç Montaj',
  };

  const projeFazDegistir = async (yeniFaz) => {
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: `Projeyi "${yeniFaz}" asamasina gecirmek istiyor musunuz?`,
      variant: 'warning',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        try {
          const formData = new FormData(); formData.append('proje_id', seciliProjeId); formData.append('yeni_faz', yeniFaz);
          await fetch(`${API_BASE_URL}/proje_faz_guncelle/`, { method: 'POST', body: formData });
          setSeciliFaz(yeniFaz);
          fetchProjeler();
        } catch {
          showToast('Asama guncellenemedi.', 'error');
        }
      },
    });
  };

  const islemGuncelleKaydet = async () => {
    setIslemKaydediliyor(true);
    try {
      const formData = new FormData();
      formData.append('is_emri_id', seciliIslem.id); 
      formData.append('status', yeniDurum); 
      formData.append('personel_adi', kullanici?.isim || 'Personel'); 
      formData.append('notlar', yeniNot);
      formData.append('mevcut_faz', aktifProjeObje.durum); // YENİ: Hangi fazda yapıldığını gönder
      formData.append('atanan_kisi', yeniAtananKisi);
      formData.append('termin_tarihi', yeniTerminTarihi);
      formData.append('oncelik', yeniOncelik);
      
      await fetch(`${API_BASE_URL}/is_emri_durum_guncelle/`, { method: 'POST', body: formData });
      fetchData(); setGuncellemeModalAcik(false);
    } catch {
      showToast('Guncelleme basarisiz.', 'error');
    }
    finally { setIslemKaydediliyor(false); }
  };

  // ==============================================================
  // 3. FOTOĞRAF GALERİSİ VE FİLTRELEME
  // ==============================================================
  const fetchGaleri = async () => {
    if (!seciliProjeId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/galeri/${seciliProjeId}`);
      setFotograflar(await response.json());
    } catch (error) { console.error(error); }
  };

  useEffect(() => { if (galeriAcik) fetchGaleri(); }, [galeriAcik, seciliProjeId]);

  const fotoYukle = async (e) => {
    const file = e.target.files[0];
    if (!file || !seciliProjeId) return;
    setFotoYukleniyor(true);
    try {
      const formData = new FormData(); 
      formData.append('project_id', seciliProjeId); 
      formData.append('yukleyen', kullanici?.isim || 'Personel'); 
      formData.append('file', file);
      formData.append('mevcut_faz', aktifProjeObje.durum); // Fotoğrafa faz mühürü
      
      await fetch(`${API_BASE_URL}/foto_yukle/`, { method: 'POST', body: formData });
      fetchGaleri(); 
    } catch {
      showToast('Fotograf yuklenemedi.', 'error');
    } finally { setFotoYukleniyor(false); }
  };

  const fotoSil = async (id) => {
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Fotografi silmek istiyor musunuz?',
      variant: 'danger',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        try {
          const formData = new FormData(); formData.append('foto_id', id);
          await fetch(`${API_BASE_URL}/foto_sil/`, { method: 'POST', body: formData });
          fetchGaleri();
        } catch {
          showToast('Fotograf silinemedi.', 'error');
        }
      },
    });
  };

  const filtrelenmisFotolar = fotograflar.filter(f => 
    galeriFiltresi === 'Tümü' || 
    (f.notlar && f.notlar.includes(galeriFiltresi)) || 
    f.file_path.includes(galeriFiltresi)
  );

  const resolveImageUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http')) return path;
    return `${API_BASE_URL}/${String(path).replace(/^\/+/, '').replace(/\\/g, '/')}`;
  };

  // ==============================================================
  // 4. TABLO VE PDF İŞLEMLERİ
  // ==============================================================
  const filtrelenmisIsler = isEmirleri.filter((is) => {
    let match = true;
    if (seciliProjeId && is.project_id != null && String(is.project_id) !== String(seciliProjeId)) {
      match = false;
    }
    if (filtreler.durum !== 'Tüm Durumlar' && is.durum !== filtreler.durum) match = false;
    if (filtreler.personel !== 'Tüm Personeller' && is.montajci !== filtreler.personel) match = false;
    const kaynak = (is.kayit_kaynagi || 'Plan').trim();
    if (kaynakFiltresi !== 'Tümü' && kaynak !== kaynakFiltresi) match = false;
    return match;
  });

  const bolumEtiketi = (is) => (is.bolum || 'İç Montaj').trim();

  const fazaGoreIsler = filtrelenmisIsler.filter((is) => {
    if (seciliFaz === 'Tümü') return true;
    return bolumEtiketi(is) === seciliFaz;
  });

  const devamEdiyorSayisi = fazaGoreIsler.filter((i) => (i.durum || '').toLowerCase().includes('devam')).length;
  const hataliSayisi = fazaGoreIsler.filter((i) => (i.durum || '').toLowerCase().includes('hatalı') || (i.durum || '').toLowerCase().includes('hatali')).length;
  const eksikSayisi = fazaGoreIsler.filter((i) => (i.durum || '').toLowerCase().includes('eksik')).length;
  const toplamIsSayisi = Math.max(1, fazaGoreIsler.length);
  const devamYuzde = Math.round((devamEdiyorSayisi / toplamIsSayisi) * 100);
  const hataliYuzde = Math.round((hataliSayisi / toplamIsSayisi) * 100);
  const eksikYuzde = Math.round((eksikSayisi / toplamIsSayisi) * 100);

  const exportPDF = async () => { 
    if (raporHazirlaniyor) return;
    setRaporHazirlaniyor(true);
    try {
      if (fazaGoreIsler.length === 0) {
        showToast('Rapor için en az 1 kayit olmali.', 'info');
        return;
      }
      const JsPDF = await loadJsPdf();
      const doc = new JsPDF();
      const raporTarihi = new Date().toLocaleString('tr-TR');
      const projeEtiketi = seciliProjeId ? `${aktifProjeObje.kod} - ${aktifProjeObje.name || ''}` : 'Tüm Projeler';
      const toplamKayit = fazaGoreIsler.length;
      const tamamlanan = fazaGoreIsler.filter((i) => i.durum === 'Tamamlandı').length;
      const acik = fazaGoreIsler.filter((i) => i.durum !== 'Tamamlandı').length;
      const hataEksik = fazaGoreIsler.filter((i) => i.durum === 'Hatalı' || i.durum === 'Eksik').length;
      const tamamlanmaOrani = toplamKayit > 0 ? Math.round((tamamlanan / toplamKayit) * 100) : 0;

    // helper: canvas pie chart as image
    const createPieChartImage = (entries) => {
      const canvas = document.createElement('canvas');
      canvas.width = 340;
      canvas.height = 220;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const total = entries.reduce((acc, [, count]) => acc + count, 0) || 1;
      const centerX = 95;
      const centerY = 110;
      const radius = 70;
      let angle = -Math.PI / 2;
      const colors = [
        '#16a34a',
        '#2563eb',
        '#ca8a04',
        '#dc2626',
        '#ea580c',
        '#475569',
      ];

      entries.forEach(([label, count], idx) => {
        const slice = (count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fill();
        angle += slice;
      });

      // donut center
      ctx.beginPath();
      ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`${total}`, centerX - 8, centerY + 5);

      // legend
      ctx.font = '12px Arial';
      entries.slice(0, 6).forEach(([label, count], idx) => {
        const y = 30 + idx * 28;
        const color = colors[idx % colors.length];
        ctx.fillStyle = color;
        ctx.fillRect(180, y, 12, 12);
        ctx.fillStyle = '#334155';
        const pct = Math.round((count / total) * 100);
        ctx.fillText(`${label} (${count}) - ${pct}%`, 200, y + 10);
      });

      return canvas.toDataURL('image/png');
    };

    // 1) Kapak
    doc.setFontSize(17);
    doc.setTextColor(20, 20, 20);
    doc.text("UNIMAK URETIM RAPORU", 14, 18);
    doc.setDrawColor(30, 41, 59);
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(165, 10, 30, 10, 2, 2, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('UNIMAK', 171.5, 16.5);
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(`Proje: ${projeEtiketi}`, 14, 26);
    doc.text(`Faz: ${seciliFaz} | Raporlayan: ${kullanici?.isim || 'Yonetici'} | Tarih: ${raporTarihi}`, 14, 32);

    // 2) KPI kartları
    const cardY = 40;
    const cards = [
      { label: 'Toplam Kayit', value: toplamKayit, color: [15, 23, 42] },
      { label: 'Tamamlanan', value: tamamlanan, color: [22, 163, 74] },
      { label: 'Acik Is', value: acik, color: [202, 138, 4] },
      { label: 'Hata / Eksik', value: hataEksik, color: [220, 38, 38] },
    ];
    cards.forEach((c, idx) => {
      const x = 14 + idx * 47;
      doc.setDrawColor(225, 230, 235);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, cardY, 44, 18, 2, 2, 'FD');
      doc.setTextColor(...c.color);
      doc.setFontSize(14);
      doc.text(String(c.value), x + 3, cardY + 8);
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(c.label, x + 3, cardY + 14);
    });

    // 3) Durum dagilimi (bar + pie)
    const durumSayim = fazaGoreIsler.reduce((acc, item) => {
      const key = item.durum || 'Bilinmiyor';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const durumEntries = Object.entries(durumSayim).sort((a, b) => b[1] - a[1]);
    const barStartY = 66;
    doc.setFontSize(11);
    doc.setTextColor(25, 25, 25);
    doc.text('Durum Dagilimi', 14, barStartY);

    const totalForDist = Math.max(1, toplamKayit);
    const barColors = {
      'Tamamlandı': [22, 163, 74],
      'Devam Ediyor': [37, 99, 235],
      'Beklemede': [202, 138, 4],
      'Hatalı': [220, 38, 38],
      'Eksik': [234, 88, 12],
    };

    durumEntries.slice(0, 6).forEach(([label, count], index) => {
      const y = barStartY + 7 + index * 8;
      const ratio = count / totalForDist;
      const width = Math.max(2, Math.round(110 * ratio));
      const c = barColors[label] || [71, 85, 105];

      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      doc.text(`${label} (${count})`, 14, y);
      doc.setFillColor(230, 234, 239);
      doc.roundedRect(56, y - 3.2, 110, 4.6, 1, 1, 'F');
      doc.setFillColor(...c);
      doc.roundedRect(56, y - 3.2, width, 4.6, 1, 1, 'F');
      doc.setTextColor(90, 90, 90);
      doc.text(`${Math.round(ratio * 100)}%`, 170, y);
    });

    // Real pie chart image
      const pieDataUrl = createPieChartImage(durumEntries);
      if (pieDataUrl) {
        try {
          doc.addImage(pieDataUrl, 'PNG', 14, 114, 182, 56);
        } catch {
          // grafik gömülemezse rapora tablosal olarak devam et
        }
      }

      // 5) Son hareketler
      const sonHareketler = [...fazaGoreIsler]
        .sort((a, b) => (b.id || 0) - (a.id || 0))
        .slice(0, 6)
        .map((item) => {
          const detay = parseFazNotu(item.notlar);
          return [item.tarih || '-', item.islem || '-', item.durum || '-', item.montajci || '-', detay.temizNot || '-'];
        });

      const sonHareketStartY = pieDataUrl ? 176 : 102;
      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: sonHareketStartY,
          margin: { left: 14, right: 14 },
          head: [['Son Kayit Zamani', 'Islem', 'Durum', 'Personel', 'Not']],
          body: sonHareketler.length ? sonHareketler : [['-', 'Kayıt yok', '-', '-', '-']],
          styles: { fontSize: 8.5, cellPadding: 2.5 },
          headStyles: { fillColor: [30, 41, 59] },
          theme: 'grid',
        });

        // 6) Detay tablo
        const tableData = fazaGoreIsler.map((is, i) => {
          const detay = parseFazNotu(is.notlar);
          return [ i + 1, is.islem, is.durum, is.montajci, is.tarih || '-', detay.temizNot ];
        }); 
        const finalY = doc.lastAutoTable?.finalY || (sonHareketStartY + 24);
        doc.autoTable({
          startY: finalY + 8,
          margin: { left: 14, right: 14 },
          head: [['SN', 'Islem', 'Durum', 'Personel', 'Tarih', 'Notlar']],
          body: tableData.length ? tableData : [['-', 'Kayıt yok', '-', '-', '-', '-']],
          styles: { fontSize: 8, cellPadding: 2.3 },
          headStyles: { fillColor: [15, 23, 42] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'grid',
        });
      } else {
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text('Tablo eklentisi bulunamadi. Ozet rapor olusturuldu.', 14, 180);
        fazaGoreIsler.slice(0, 20).forEach((row, idx) => {
          doc.text(`- ${row.islem || '-'} | ${row.durum || '-'} | ${row.montajci || '-'}`, 14, 188 + (idx * 5));
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p += 1) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`UNIMAK | Uretim Raporu | Sayfa ${p}/${pageCount}`, 14, 290);
      }

      // Yönetici imza bloğu (son sayfa)
      doc.setPage(pageCount);
      doc.setDrawColor(220, 225, 230);
      doc.line(130, 273, 195, 273);
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('Onaylayan Yonetici', 145, 278);
      doc.setFontSize(8);
      doc.text(`${kullanici?.isim || 'Yonetici'} | ${raporTarihi}`, 132, 283);

      const dosyaProje = seciliProjeId ? (aktifProjeObje.kod || 'Proje') : 'Tum_Projeler';
      doc.save(`${dosyaProje}_${seciliFaz.replace(' ', '_')}_Rapor.pdf`); 
    } catch (error) {
      console.error('PDF rapor olusturma hatasi:', error);
      showToast('Rapor olusturulurken hata olustu.', 'error');
    } finally {
      setRaporHazirlaniyor(false);
    }
  };
  
  const shareWhatsApp = () => { if(!seciliProjeId) return; const mesaj = `*UNIMAK PROJE RAPORU*%0A*Proje:* ${aktifProjeObje.kod}%0A*Faz:* ${seciliFaz}%0A*Kayıt:* ${fazaGoreIsler.length}%0A*Raporlayan:* ${kullanici?.isim || 'Yönetici'}`; window.open(`https://wa.me/?text=${mesaj}`, '_blank'); };
  const isWhatsAppPaylas = (is) => {
    const mesaj = `*İŞ EMRİ BİLDİRİMİ*%0A*Proje:* ${aktifProjeObje.kod}%0A*İşlem:* ${is?.islem || '-'}%0A*Durum:* ${is?.durum || '-'}%0A*Atanan:* ${is?.atanan_kisi || is?.montajci || '-'}%0A*Termin:* ${is?.termin_tarihi || '-'}%0A*Not:* ${parseFazNotu(is?.notlar).temizNot || '-'}`;
    window.open(`https://wa.me/?text=${mesaj}`, '_blank');
  };
  const isMailPaylas = (is) => {
    const konu = encodeURIComponent(`UNIMAK İş Emri - ${aktifProjeObje.kod} - #${is?.id || '-'}`);
    const govde = encodeURIComponent(
      `Proje: ${aktifProjeObje.kod}\nİşlem: ${is?.islem || '-'}\nDurum: ${is?.durum || '-'}\nAtanan: ${is?.atanan_kisi || is?.montajci || '-'}\nTermin: ${is?.termin_tarihi || '-'}\nNot: ${parseFazNotu(is?.notlar).temizNot || '-'}\nRaporlayan: ${kullanici?.isim || 'Yönetici'}`
    );
    window.open(`mailto:?subject=${konu}&body=${govde}`, '_blank');
  };
  const islemSecVeAc = (is) => {
    setSeciliIslem(is);
    setYeniDurum(is.durum || 'Beklemede');
    setYeniNot('');
    setYeniAtananKisi(is.atanan_kisi || '');
    setYeniTerminTarihi(is.termin_tarihi || '');
    setYeniOncelik(is.oncelik || 'Normal');
    setGuncellemeModalAcik(true);
  };
  const detayaGit = (is) => {
    setSeciliIslem(is);
    setDetayModalAcik(true);
  };

  // METİN PARÇALAYICI: Notların içindeki [İç Montaj] mühürlerini ayırır
  const parseFazNotu = (rawNot) => {
    if (!rawNot || rawNot === '-') return { faz: '-', temizNot: '-' };
    const match = rawNot.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) return { faz: match[1], temizNot: match[2] || '-' };
    return { faz: '-', temizNot: rawNot };
  };

  // GÖRSEL FAZ ÇİZGİSİ
  const getPhaseStyle = (phaseName) => {
    const isCurrent = aktifProjeObje.durum === phaseName;
    return { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: isCurrent ? 1 : 0.4, transform: isCurrent ? 'scale(1.05)' : 'scale(1)', transition: 'all 0.3s' };
  };
  const getPhaseLineStyle = () => {
    const isActive = aktifProjeObje.durum === 'Dış Montaj';
    return { flexGrow: 1, height: '4px', backgroundColor: isActive ? theme.primary : '#e2e8f0', margin: '0 15px', borderRadius: '2px', transition: 'background-color 0.3s' };
  };

  const icMontajIsleri = filtrelenmisIsler.filter((is) => bolumEtiketi(is) === 'İç Montaj');
  const disMontajIsleri = filtrelenmisIsler.filter((is) => bolumEtiketi(is) === 'Dış Montaj');
  const sahaKayitlari = filtrelenmisIsler.filter((is) => (is.kayit_kaynagi || 'Plan') === 'Saha');
  const bugunTarihEtiketi = new Date().toLocaleDateString('tr-TR');
  const bugunSahaKayitlari = sahaKayitlari.filter((is) => (is.tarih || '').startsWith(bugunTarihEtiketi));
  const bugunSahaSon5 = [...bugunSahaKayitlari].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);
  const bugunIso = new Date().toISOString().slice(0, 10);
  const gecikenSahaIsleri = sahaKayitlari.filter((is) => {
    const terminIso = terminTarihiIsoGun(is.termin_tarihi);
    if (!terminIso) return false;
    const tamamlandi = (is.durum || '').toLowerCase() === 'tamamlandı'.toLowerCase();
    if (tamamlandi) return false;
    return terminIso < bugunIso;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', flex: 1, backgroundColor: '#f8fafc', padding: '30px', boxSizing: 'border-box', overflowY: 'auto' }}>
      
      {/* ÜST KOMUTA MERKEZİ */}
      <div style={{backgroundColor: 'white', padding: '24px', borderRadius: '15px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', flexShrink: 0}}>
        
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <div style={{ backgroundColor: '#fff7ed', padding: '12px', borderRadius: '12px' }}><Activity size={24} color="#ea580c" /></div>
            <div>
              <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px', fontWeight: '900' }}>Saha & İş Emri Takibi</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '13px', fontWeight: '700' }}>Yıl:</span>
                <select value={seciliYil} onChange={(e) => { kullaniciYilSecimiRef.current = true; setSeciliYil(e.target.value); setSeciliProjeId(''); }} style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: '800', fontSize: '13px', cursor: 'pointer', outline: 'none', borderRadius: '8px', padding: '8px 10px', minWidth: '90px', boxShadow: 'inset 0 1px 4px rgba(0, 0, 0, 0.1)' }}>
                  <option value="">Tümü</option>
                  {availableYears.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <span style={{ color: '#64748b', fontSize: '13px', fontWeight: '700' }}>Aktif Proje:</span>
                <select value={seciliProjeId} onChange={(e) => setSeciliProjeId(e.target.value)} style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: '800', fontSize: '13px', cursor: 'pointer', outline: 'none', borderRadius: '8px', padding: '8px 10px', minWidth: '280px', boxShadow: 'inset 0 1px 4px rgba(0, 0, 0, 0.1)' }}>
                  {projeler.length === 0 ? (
                    <option value="">Aktif proje yok</option>
                  ) : (
                    <>
                      <option value="">Tümü</option>
                      {projeler.map((p) => (
                        <option key={p.id} value={String(p.id)}>{p.kod} - {p.name}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>
          
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
             <button onClick={() => setConfirmState({
              open: true,
              title: 'UNIMAK ISLEM ONAYI',
              message: 'Proje ozeti WhatsApp ile paylasilacak. Devam edilsin mi?',
              variant: 'warning',
              onCancel: () => setConfirmState({ open: false }),
              onConfirm: () => { setConfirmState({ open: false }); shareWhatsApp(); },
             })} style={{backgroundColor: '#25D366', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold'}}><Send size={16}/> WhatsApp</button>
             <button disabled={raporHazirlaniyor} onClick={exportPDF} style={{backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: raporHazirlaniyor ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', opacity: raporHazirlaniyor ? 0.75 : 1}}><FileText size={16}/> {raporHazirlaniyor ? 'Rapor Hazirlaniyor...' : 'Rapor'}</button>
          </div>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <span style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Gösterilecek Faz:</span>
          <button onClick={() => setSeciliFaz('Tümü')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: seciliFaz === 'Tümü' ? '#0f172a' : '#e2e8f0', color: seciliFaz === 'Tümü' ? '#fff' : '#334155'}}>Tümü</button>
          <button onClick={() => setSeciliFaz('İç Montaj')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: seciliFaz === 'İç Montaj' ? '#0369a1' : '#e2e8f0', color: seciliFaz === 'İç Montaj' ? '#fff' : '#334155'}}>İç Montaj</button>
          <button onClick={() => setSeciliFaz('Dış Montaj')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: seciliFaz === 'Dış Montaj' ? '#c2410c' : '#e2e8f0', color: seciliFaz === 'Dış Montaj' ? '#fff' : '#334155'}}>Dış Montaj</button>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <span style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Kayıt Kaynağı:</span>
          <button onClick={() => setKaynakFiltresi('Tümü')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: kaynakFiltresi === 'Tümü' ? '#0f172a' : '#e2e8f0', color: kaynakFiltresi === 'Tümü' ? '#fff' : '#334155'}}>Tümü</button>
          <button onClick={() => setKaynakFiltresi('Plan')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: kaynakFiltresi === 'Plan' ? '#0f766e' : '#e2e8f0', color: kaynakFiltresi === 'Plan' ? '#fff' : '#334155'}}>Plan</button>
          <button onClick={() => setKaynakFiltresi('Saha')} style={{border:'none', borderRadius:'18px', padding:'6px 12px', fontWeight:700, cursor:'pointer', background: kaynakFiltresi === 'Saha' ? '#7c3aed' : '#e2e8f0', color: kaynakFiltresi === 'Saha' ? '#fff' : '#334155'}}>Saha</button>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: '10px'}}>
          <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px'}}>
            <div style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Proje Kodu</div>
            <div style={{fontSize:'15px', fontWeight:800, color:'#0f172a'}}>{aktifProjeObje.kod}</div>
          </div>
          <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px'}}>
            <div style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>İç Montaj Kayıt</div>
            <div style={{fontSize:'22px', fontWeight:900, color:'#0369a1'}}>{icMontajIsleri.length}</div>
          </div>
          <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px'}}>
            <div style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Dış Montaj Kayıt</div>
            <div style={{fontSize:'22px', fontWeight:900, color:'#c2410c'}}>{disMontajIsleri.length}</div>
          </div>
          <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px'}}>
            <div style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Seçili Faz</div>
            <div style={{fontSize:'15px', fontWeight:800, color:'#0f172a'}}>{seciliFaz}</div>
          </div>
          <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px'}}>
            <div style={{fontSize:'12px', color:'#64748b', fontWeight:700}}>Sahadan Gelen</div>
            <div style={{fontSize:'22px', fontWeight:900, color:'#7c3aed'}}>{sahaKayitlari.length}</div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
          <div style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'12px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
              <strong style={{color:'#334155'}}>Bugün Sahadan Gelenler</strong>
              <span style={{fontSize:'12px', fontWeight:800, color:'#7c3aed'}}>{bugunSahaKayitlari.length} kayıt</span>
            </div>
            {bugunSahaSon5.length === 0 ? (
              <div style={{fontSize:'13px', color:'#64748b'}}>Bugün sahadan yeni kayıt yok.</div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px'}}>
                {bugunSahaSon5.map((is) => (
                  <div key={is.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', fontSize:'13px'}}>
                    <span style={{color:'#0f172a', fontWeight:700}}>#{is.id} {is.islem}</span>
                    <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                      <span style={{color:'#64748b'}}>{is.montajci || '-'}</span>
                      <button onClick={() => detayaGit(is)} style={{border:'none', borderRadius:'6px', padding:'4px 8px', background:'#0f172a', color:'#fff', fontWeight:700, cursor:'pointer'}}>Detaya Git</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'12px', padding:'12px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
              <strong style={{color:'#9a3412'}}>Geciken Saha İşleri</strong>
              <span style={{fontSize:'12px', fontWeight:800, color:'#c2410c'}}>{gecikenSahaIsleri.length} iş</span>
            </div>
            {gecikenSahaIsleri.length === 0 ? (
              <div style={{fontSize:'13px', color:'#7c2d12'}}>Geciken saha işi bulunmuyor.</div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px'}}>
                {gecikenSahaIsleri.map((is) => (
                  <div key={is.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', fontSize:'13px'}}>
                    <span style={{color:'#7c2d12', fontWeight:700}}>#{is.id} {is.islem}</span>
                    <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                      <span style={{color:'#9a3412'}}>Termin: {is.termin_tarihi}</span>
                      <button onClick={() => detayaGit(is)} style={{border:'none', borderRadius:'6px', padding:'4px 8px', background:'#9a3412', color:'#fff', fontWeight:700, cursor:'pointer'}}>Detaya Git</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AKTİF İŞLER VERİ TABLOSU */}
      <div style={{backgroundColor: 'white', borderRadius: '15px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: `1px solid #e2e8f0`, overflowX: 'auto'}}>
        <div style={{padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px'}}>
          {seciliFaz === 'İç Montaj' ? <Factory size={18} color="#0369a1" /> : <Building2 size={18} color="#c2410c" />}
          <strong style={{color: seciliFaz === 'İç Montaj' ? '#0369a1' : '#c2410c'}}>{seciliFaz} İşlemler ({fazaGoreIsler.length})</strong>
        </div>
        <div style={{padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: '800', color: '#334155'}}>
            <span>Durum Dolum Barı</span>
            <span>Devam: %{devamYuzde} | Hatalı: %{hataliYuzde} | Eksik: %{eksikYuzde}</span>
          </div>
          <div style={{display: 'flex', width: '100%', height: '10px', borderRadius: '999px', overflow: 'hidden', background: '#e2e8f0'}}>
            <div style={{width: `${devamYuzde}%`, background: '#0ea5e9'}}></div>
            <div style={{width: `${hataliYuzde}%`, background: '#ef4444'}}></div>
            <div style={{width: `${eksikYuzde}%`, background: '#f59e0b'}}></div>
          </div>
          <div style={{display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', fontWeight: '700'}}>
            <span style={{color: '#0369a1'}}>Devam Ediyor ({devamEdiyorSayisi})</span>
            <span style={{color: '#b91c1c'}}>Hatalı ({hataliSayisi})</span>
            <span style={{color: '#b45309'}}>Eksik ({eksikSayisi})</span>
          </div>
        </div>
        <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px'}}>
          <thead>
            <tr style={{backgroundColor: '#f8fafc', borderBottom: `2px solid #e2e8f0`}}>
              {['SN', 'Bölüm', 'İşlem', 'Aşama', 'Durum', 'Kaynak', 'Öncelik', 'Atanan', 'Foto', 'Montajcı', 'Tarih', 'Notlar', 'Aksiyon'].map(h => <th key={h} style={{padding: '16px 20px', color: '#64748b', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase'}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="13" style={{padding: '30px', textAlign: 'center'}}>Yükleniyor...</td></tr> : 
              fazaGoreIsler.length === 0 ? <tr><td colSpan="13" style={{padding: '30px', textAlign: 'center', color: '#64748b'}}>{seciliFaz} için kayıt bulunamadı.</td></tr> :
              fazaGoreIsler.map((is) => {
                const islemDetay = parseFazNotu(is.notlar);
                return (
                  <tr key={is.id} style={{borderBottom: `1px solid #e2e8f0`}}>
                    <td style={{padding: '16px 20px', fontWeight: '800', color: '#94a3b8'}}>#{is.id}</td>
                    <td style={{padding: '16px 20px', color: '#64748b', fontSize: '13px'}}>{is.bolum}</td>
                    <td style={{padding: '16px 20px', color: '#1e293b', fontWeight: '800', fontSize: '14px'}}>{is.islem}</td>
                    
                    {/* YENİ: AŞAMA ETİKETİ (FABRİKA MI SAHA MI?) */}
                    <td style={{padding: '16px 20px', textAlign: 'center'}}>
                      {islemDetay.faz !== '-' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '92px', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', lineHeight: 1.2, whiteSpace: 'nowrap', backgroundColor: islemDetay.faz === 'Dış Montaj' ? '#ffedd5' : islemDetay.faz === 'İç Montaj' ? '#e0f2fe' : '#f1f5f9', color: islemDetay.faz === 'Dış Montaj' ? '#c2410c' : islemDetay.faz === 'İç Montaj' ? '#0369a1' : '#475569' }}>
                          {islemDetay.faz.toUpperCase()}
                        </span>
                      )}
                    </td>

                    <td style={{padding: '16px 20px', textAlign: 'center'}}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '112px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', lineHeight: 1.2, whiteSpace: 'nowrap', fontWeight: '800', border: '1px solid', backgroundColor: is.durum === 'Tamamlandı' ? '#dcfce3' : (is.durum === 'Hatalı' || is.durum === 'Eksik') ? '#fee2e2' : '#fef9c3', color: is.durum === 'Tamamlandı' ? '#16a34a' : (is.durum === 'Hatalı' || is.durum === 'Eksik') ? '#dc2626' : '#ca8a04', borderColor: is.durum === 'Tamamlandı' ? '#bbf7d0' : (is.durum === 'Hatalı' || is.durum === 'Eksik') ? '#fecaca' : '#fef08a' }}>{is.durum}</span></td>
                    <td style={{padding: '16px 20px'}}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', backgroundColor: (is.kayit_kaynagi || 'Plan') === 'Saha' ? '#f3e8ff' : '#dcfce7', color: (is.kayit_kaynagi || 'Plan') === 'Saha' ? '#6d28d9' : '#166534' }}>
                        {is.kayit_kaynagi || 'Plan'}
                      </span>
                    </td>
                    <td style={{padding: '16px 20px'}}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', backgroundColor: (is.oncelik || 'Normal') === 'Kritik' ? '#fee2e2' : (is.oncelik || 'Normal') === 'Yüksek' ? '#ffedd5' : '#ecfeff', color: (is.oncelik || 'Normal') === 'Kritik' ? '#b91c1c' : (is.oncelik || 'Normal') === 'Yüksek' ? '#c2410c' : '#155e75' }}>
                        {is.oncelik || 'Normal'}
                      </span>
                    </td>
                    <td style={{padding: '16px 20px', color: '#1e293b', fontSize: '13px', fontWeight: '700'}}>{is.atanan_kisi || '-'}</td>
                    <td style={{padding: '16px 20px', color: '#64748b', fontSize: '13px', textAlign: 'center'}}>
                      {is.resim_url ? (
                        <button
                          onClick={() => setTabloFotoDetay({
                            url: resolveImageUrl(is.resim_url),
                            aciklama: islemDetay.temizNot || '-',
                            islem: is.islem || '-',
                            montajci: is.montajci || '-',
                            tarih: is.tarih || '-',
                          })}
                          style={{ border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', fontSize: '18px' }}
                          title="Fotoğrafı görüntüle"
                        >
                          📷
                        </button>
                      ) : '-'}
                    </td>
                    <td style={{padding: '16px 20px', color: '#1e293b', fontSize: '13px', fontWeight: '600'}}>{is.montajci}</td>
                    <td style={{padding: '16px 20px', color: '#64748b', fontSize: '12px'}}>{is.tarih}</td>
                    <td style={{padding: '16px 20px', color: '#64748b', fontSize: '13px'}}>{islemDetay.temizNot}</td>
                    <td style={{padding: '16px 20px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <button onClick={() => setConfirmState({
                          open: true,
                          title: 'UNIMAK ISLEM ONAYI',
                          message: 'Is emri bilgisi WhatsApp ile paylasilacak. Devam edilsin mi?',
                          variant: 'warning',
                          onCancel: () => setConfirmState({ open: false }),
                          onConfirm: () => { setConfirmState({ open: false }); isWhatsAppPaylas(is); },
                        })} style={{backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}><Send size={13}/> WA</button>
                        <button onClick={() => setConfirmState({
                          open: true,
                          title: 'UNIMAK ISLEM ONAYI',
                          message: 'Is emri bilgisi e-posta taslagi olarak acilacak. Devam edilsin mi?',
                          variant: 'warning',
                          onCancel: () => setConfirmState({ open: false }),
                          onConfirm: () => { setConfirmState({ open: false }); isMailPaylas(is); },
                        })} style={{backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}><Mail size={13}/> Mail</button>
                        <button onClick={() => islemSecVeAc(is)} style={{backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}><PenTool size={14}/> Düzenle</button>
                      </div>
                    </td>
                  </tr>
                )
            })}
          </tbody>
        </table>
      </div>

      {/* ============================================================== */}
      {/* FOTO GALERİ MODALI (FİLTRELİ) */}
      {/* ============================================================== */}
      {galeriAcik && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)'}}>
          <div style={{backgroundColor: '#f8fafc', borderRadius: '16px', width: '90%', maxWidth: '1000px', height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden'}}>
            
            <div style={{backgroundColor: 'white', padding: '24px', borderBottom: `1px solid #e2e8f0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ backgroundColor: '#e0f2fe', padding: '10px', borderRadius: '10px' }}><ImageIcon size={24} color="#0ea5e9" /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e293b' }}>Proje Arşivi & Galeri</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Proje: {aktifProjeObje.kod}</p>
                </div>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                <label style={{backgroundColor: '#0ea5e9', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  {fotoYukleniyor ? <Activity size={18} className="spin" /> : <Camera size={18}/>}
                  {fotoYukleniyor ? 'Yükleniyor...' : 'Fotoğraf Yükle'}
                  <input type="file" accept="image/*" onChange={fotoYukle} style={{display: 'none'}} disabled={fotoYukleniyor} />
                </label>
                <button onClick={() => setGaleriAcik(false)} style={{background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><X size={24}/></button>
              </div>
            </div>

            {/* YENİ: GALERİ FİLTRELERİ */}
            <div style={{backgroundColor: 'white', padding: '12px 24px', borderBottom: `1px solid #e2e8f0`, display: 'flex', gap: '10px'}}>
               <button onClick={() => setGaleriFiltresi('Tümü')} style={{padding: '8px 16px', borderRadius: '20px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: galeriFiltresi === 'Tümü' ? '#1e293b' : '#f1f5f9', color: galeriFiltresi === 'Tümü' ? 'white' : '#64748b'}}>Tümü</button>
               <button onClick={() => setGaleriFiltresi('İç Montaj')} style={{padding: '8px 16px', borderRadius: '20px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: galeriFiltresi === 'İç Montaj' ? '#0ea5e9' : '#f1f5f9', color: galeriFiltresi === 'İç Montaj' ? 'white' : '#64748b', boxShadow: '0px 4px 12px 0px rgba(0, 0, 0, 0.15)'}}><Factory size={14} style={{display:'inline', marginRight:'5px'}}/> İç Montaj</button>
               <button onClick={() => setGaleriFiltresi('Dış Montaj')} style={{padding: '8px 16px', borderRadius: '20px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: galeriFiltresi === 'Dış Montaj' ? '#f97316' : '#f1f5f9', color: galeriFiltresi === 'Dış Montaj' ? 'white' : '#64748b', boxShadow: '0px 4px 12px 0px rgba(0, 0, 0, 0.15)'}}><Building2 size={14} style={{display:'inline', marginRight:'5px'}}/> Dış Montaj</button>
            </div>

            <div style={{padding: '24px', flexGrow: 1, overflowY: 'auto'}}>
              {filtrelenmisFotolar.length === 0 ? (
                <div style={{height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94a3b8'}}><ImageIcon size={64} style={{opacity: 0.2, marginBottom: '15px'}}/><h3>Bu aşamaya ait fotoğraf bulunamadı.</h3></div>
              ) : (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px'}}>
                  {filtrelenmisFotolar.map(foto => {
                    const resimYolu = `${API_BASE_URL}/${foto.file_path.replace(/\\/g, '/')}`;
                    const fazEtiketi = foto.notlar || 'Genel';
                    return (
                      <div key={foto.id} style={{backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', border: `1px solid #e2e8f0`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative'}}>
                        <button onClick={(e) => { e.stopPropagation(); fotoSil(foto.id); }} style={{position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', fontSize: '12px'}}><Trash2 size={16}/> SİL</button>
                        
                        {/* FOTOĞRAF ÜSTÜ AŞAMA ETİKETİ */}
                        <div style={{position: 'absolute', top: '10px', left: '10px', backgroundColor: fazEtiketi === 'Dış Montaj' ? '#f97316' : '#0ea5e9', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', zIndex: 10}}>{fazEtiketi.toUpperCase()}</div>

                        <div onClick={() => setTamEkranFoto(resimYolu)} style={{height: '200px', backgroundColor: '#e2e8f0', backgroundImage: `url("${resimYolu}")`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in'}}></div>
                        <div style={{padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px'}}><strong style={{color: '#1e293b', fontSize: '13px'}}>{foto.yukleyen}</strong><span style={{color: '#64748b', fontSize: '12px'}}>{foto.tarih}</span></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAM EKRAN (LIGHTBOX) */}
      {tamEkranFoto && (
        <div onClick={() => setTamEkranFoto(null)} style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'zoom-out'}}>
          <button onClick={() => setTamEkranFoto(null)} style={{position: 'absolute', top: '30px', right: '30px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '10px'}}><X size={40}/></button>
          <img src={tamEkranFoto} alt="Tam Ekran" style={{maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px'}} />
        </div>
      )}

      {tabloFotoDetay && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.78)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
          <div style={{background: 'white', width: '100%', maxWidth: '760px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0'}}>
              <strong style={{color: '#0f172a'}}>Fotoğraf Detayı</strong>
              <button onClick={() => setTabloFotoDetay(null)} style={{background: '#f1f5f9', border: 'none', borderRadius: '999px', width: 30, height: 30, cursor: 'pointer'}}><X size={16} /></button>
            </div>
            <div style={{padding: '14px'}}>
              <img src={tabloFotoDetay.url} alt="İşlem Fotoğrafı" style={{width: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '10px', background: '#f8fafc'}} />
              <div style={{marginTop: '12px', fontSize: '13px', color: '#334155', display: 'grid', gap: '6px'}}>
                <div><strong>İşlem:</strong> {tabloFotoDetay.islem}</div>
                <div><strong>Açıklama:</strong> {tabloFotoDetay.aciklama}</div>
                <div><strong>Personel:</strong> {tabloFotoDetay.montajci}</div>
                <div><strong>Tarih:</strong> {tabloFotoDetay.tarih}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* MONTAJCI RAPOR / GÜNCELLEME EKRANI MODALI */}
      {detayModalAcik && seciliIslem && (
         <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          <div style={{backgroundColor: 'white', padding: '26px', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
              <h3 style={{margin: 0, color: '#1e293b'}}>İşlem Detayı</h3>
              <button onClick={() => setDetayModalAcik(false)} style={{background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><X size={18}/></button>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', color: '#334155'}}>
              <div><strong>İşlem:</strong> {seciliIslem.islem || '-'}</div>
              <div><strong>Durum:</strong> {seciliIslem.durum || '-'}</div>
              <div><strong>Atanan:</strong> {seciliIslem.atanan_kisi || seciliIslem.montajci || '-'}</div>
              <div><strong>Termin:</strong> {seciliIslem.termin_tarihi || '-'}</div>
              <div><strong>Kaynak:</strong> {seciliIslem.kayit_kaynagi || 'Plan'}</div>
              <div><strong>Tarih:</strong> {seciliIslem.tarih || '-'}</div>
              <div style={{gridColumn: 'span 2'}}><strong>Not:</strong> {parseFazNotu(seciliIslem.notlar).temizNot || '-'}</div>
            </div>
            <div style={{marginTop: '14px'}}>
              {seciliIslem.resim_url ? (
                <div style={{border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc'}}>
                  <img
                    src={seciliIslem.resim_url.startsWith('http') ? seciliIslem.resim_url : `${API_BASE_URL}/${String(seciliIslem.resim_url).replace(/^\/+/, '')}`}
                    alt="İşlem fotoğrafı"
                    style={{width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block'}}
                  />
                </div>
              ) : (
                <div style={{padding: '10px 12px', border: '1px dashed #cbd5e1', borderRadius: '10px', color: '#64748b', fontSize: '12px', fontWeight: '700'}}>
                  Bu kayda ait fotoğraf bulunmuyor.
                </div>
              )}
            </div>
            <div style={{display: 'flex', gap: '10px', marginTop: '18px'}}>
              <button onClick={() => isWhatsAppPaylas(seciliIslem)} style={{flex: 1, backgroundColor: '#25D366', color: 'white', border: 'none', padding: '10px 12px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}><Send size={16}/> WhatsApp Gönder</button>
              <button onClick={() => isMailPaylas(seciliIslem)} style={{flex: 1, backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px 12px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}><Mail size={16}/> Mail Gönder</button>
            </div>
          </div>
        </div>
      )}

      {/* MONTAJCI RAPOR / GÜNCELLEME EKRANI MODALI */}
      {guncellemeModalAcik && seciliIslem && (
         <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          <div style={{backgroundColor: 'white', padding: '30px', borderRadius: '16px', width: '100%', maxWidth: '450px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3 style={{margin: 0, color: '#1e293b'}}>İşlem Raporla / Güncelle</h3>
              <button onClick={() => setGuncellemeModalAcik(false)} style={{background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><X size={18}/></button>
            </div>
            
            <div style={{backgroundColor: '#eff6ff', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', color: '#1e3a8a', display: 'flex', gap: '8px'}}>
              <Info size={16}/> <span>Şu an bu kaydı <strong>{aktifProjeObje.durum}</strong> aşamasında mühürlüyorsunuz.</span>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <select value={yeniDurum} onChange={(e) => setYeniDurum(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold'}}>
                <option value="Beklemede">Beklemede</option><option value="Devam Ediyor">Devam Ediyor</option><option value="Eksik">Parça Eksik</option><option value="Hatalı">Hatalı</option><option value="Tamamlandı">Tamamlandı</option>
              </select>
              <select value={yeniOncelik} onChange={(e) => setYeniOncelik(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold'}}>
                <option value="Normal">Normal Öncelik</option>
                <option value="Yüksek">Yüksek Öncelik</option>
                <option value="Kritik">Kritik Öncelik</option>
              </select>
              <input value={yeniAtananKisi} onChange={(e) => setYeniAtananKisi(e.target.value)} placeholder="Atanan personel / ekip" style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none'}} />
              <input type="date" value={yeniTerminTarihi} onChange={(e) => setYeniTerminTarihi(e.target.value)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none'}} />
              <textarea value={yeniNot} onChange={(e) => setYeniNot(e.target.value)} rows="3" placeholder="Saha veya üretim notu ekleyin..." style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'inherit', resize: 'vertical'}}></textarea>
              <button disabled={islemKaydediliyor} onClick={() => setConfirmState({
                open: true,
                title: 'UNIMAK ISLEM ONAYI',
                message: 'Is emri durum degisikligi kaydedilecek. Devam edilsin mi?',
                variant: 'warning',
                onCancel: () => setConfirmState({ open: false }),
                onConfirm: async () => { setConfirmState({ open: false }); await islemGuncelleKaydet(); },
              })} style={{width: '100%', padding: '14px', backgroundColor: theme.primary, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: islemKaydediliyor ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: islemKaydediliyor ? 0.7 : 1}}>
                {islemKaydediliyor ? 'Kaydediliyor...' : 'Raporu Kaydet'}
              </button>
            </div>
          </div>
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

export default Dashboard;