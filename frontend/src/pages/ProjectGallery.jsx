import React, { useEffect, useState } from 'react';
import { Activity, Camera, Image as ImageIcon, Trash2, X, Factory, Building2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import UnimakConfirmModal from '../components/UnimakConfirmModal';
import UnimakToast from '../components/UnimakToast';
import useUnimakToast from '../hooks/useUnimakToast';

export default function ProjectGallery({ kullanici }) {
  const [availableYears, setAvailableYears] = useState([]);
  const [seciliYil, setSeciliYil] = useState('');
  const [projeler, setProjeler] = useState([]);
  const [seciliProjeId, setSeciliProjeId] = useState('');
  const [fotograflar, setFotograflar] = useState([]);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const [galeriYukleniyor, setGaleriYukleniyor] = useState(false);
  const [silinenFotoId, setSilinenFotoId] = useState(null);
  const [tamEkranFoto, setTamEkranFoto] = useState(null);
  const [tamEkranIndex, setTamEkranIndex] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [galeriFiltresi, setGaleriFiltresi] = useState('Tümü');
  const [confirmState, setConfirmState] = useState({ open: false });
  const { toastState, showToast, dismissToast } = useUnimakToast();

  const aktifProje = projeler.find((p) => String(p.id) === String(seciliProjeId));

  const requestJson = async (url, options) => {
    const response = await fetch(`${API_BASE_URL}${url}`, options);
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new Error(data?.hata || data?.detail || `${url} başarısız`);
    }
    return data;
  };

  const fetchProjeler = async () => {
    try {
      const yilQuery = seciliYil ? `?yil=${seciliYil}` : '';
      const data = await requestJson(`/is_emri_kayitlari/${yilQuery}`);
      const aktif = (Array.isArray(data) ? data : []).filter((p) => p.durum !== 'Tamamlandı');
      setProjeler(aktif);
      if (seciliProjeId && !aktif.some((p) => String(p.id) === String(seciliProjeId))) {
        setSeciliProjeId('');
      }
    } catch (error) {
      console.error(error);
      setProjeler([]);
    }
  };

  const fetchGaleri = async () => {
    setGaleriYukleniyor(true);
    try {
      if (seciliProjeId) {
        const data = await requestJson(`/galeri/${seciliProjeId}`);
        setFotograflar(Array.isArray(data) ? data : []);
        return;
      }
      if (projeler.length === 0) {
        setFotograflar([]);
        return;
      }
      const all = await Promise.all(
        projeler.map(async (proje) => {
          const data = await requestJson(`/galeri/${proje.id}`);
          const list = Array.isArray(data) ? data : [];
          return list.map((foto) => ({
            ...foto,
            proje_kod: proje.kod,
            proje_ad: proje.name,
          }));
        })
      );
      setFotograflar(all.flat());
    } catch (error) {
      console.error(error);
      setFotograflar([]);
    } finally {
      setGaleriYukleniyor(false);
    }
  };

  const fetchYillar = async () => {
    try {
      const data = await requestJson('/meta/yillar');
      const years = Array.isArray(data?.years) ? data.years : [];
      setAvailableYears(years);
    } catch (error) {
      console.error(error);
      setAvailableYears([]);
    }
  };

  useEffect(() => {
    fetchYillar();
    fetchProjeler();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProjeler();
  }, [seciliYil]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchGaleri();
  }, [seciliProjeId, projeler]); // eslint-disable-line react-hooks/exhaustive-deps

  const fotoYukle = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !seciliProjeId) return;
    setFotoYukleniyor(true);
    try {
      const formData = new FormData();
      formData.append('project_id', seciliProjeId);
      formData.append('yukleyen', kullanici?.isim || 'Personel');
      formData.append('file', file);
      formData.append('mevcut_faz', 'İç Montaj');
      await fetch(`${API_BASE_URL}/foto_yukle/`, { method: 'POST', body: formData });
      await fetchGaleri();
    } catch (error) {
      console.error(error);
      showToast('Fotograf yuklenemedi.', 'error');
    } finally {
      setFotoYukleniyor(false);
      e.target.value = null;
    }
  };

  const fotoSil = async (id) => {
    setConfirmState({
      open: true,
      title: 'UNIMAK ISLEM ONAYI',
      message: 'Bu fotografi kalici olarak silmek istiyor musunuz?',
      variant: 'danger',
      onCancel: () => setConfirmState({ open: false }),
      onConfirm: async () => {
        setConfirmState({ open: false });
        setSilinenFotoId(id);
        try {
          const formData = new FormData();
          formData.append('foto_id', id);
          await fetch(`${API_BASE_URL}/foto_sil/`, { method: 'POST', body: formData });
          await fetchGaleri();
        } catch (error) {
          console.error(error);
          showToast('Fotograf silinemedi.', 'error');
        } finally {
          setSilinenFotoId(null);
        }
      },
    });
  };

  const filtrelenmisFotolar = fotograflar.filter((f) => {
    if (galeriFiltresi === 'Tümü') return true;
    const etiket = (f.notlar || '').toLowerCase();
    const yol = (f.file_path || '').toLowerCase();
    return etiket.includes(galeriFiltresi.toLowerCase()) || yol.includes(galeriFiltresi.toLowerCase());
  });

  const fotoDetayinaAc = (foto, index) => {
    const yol = `${API_BASE_URL}/${String(foto.file_path || '').replace(/\\/g, '/')}`;
    const etiket = foto.notlar || 'Genel';
    const projeBilgisi = foto.proje_kod
      ? `${foto.proje_kod} - ${foto.proje_ad || ''}`
      : (() => {
          const proje = projeler.find((p) => p.id === foto.project_id);
          return proje ? `${proje.kod} - ${proje.name}` : '-';
        })();
    setTamEkranFoto({
      url: yol,
      proje: projeBilgisi,
      yukleyen: foto.yukleyen || '-',
      tarih: foto.tarih || '-',
      asama: etiket,
      dosya: foto.file_path || '-',
    });
    setTamEkranIndex(index);
    setZoom(1);
  };

  const detayGezin = (yon) => {
    if (filtrelenmisFotolar.length === 0 || tamEkranIndex < 0) return;
    const yeniIndex = (tamEkranIndex + yon + filtrelenmisFotolar.length) % filtrelenmisFotolar.length;
    fotoDetayinaAc(filtrelenmisFotolar[yeniIndex], yeniIndex);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ImageIcon size={22} color="#0ea5e9" />
          <div>
            <div style={{ fontWeight: 900, color: '#1e293b' }}>Proje Foto Galeri</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Checklist yanında ayrı sayfa</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={seciliYil}
            onChange={(e) => setSeciliYil(e.target.value)}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', minWidth: 110, fontWeight: 700 }}
          >
            <option value="">Yıl: Tümü</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={seciliProjeId}
            onChange={(e) => setSeciliProjeId(e.target.value)}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', minWidth: 260, fontWeight: 700 }}
          >
            <option value="">Tümü</option>
            {projeler.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.kod} - {p.name}
              </option>
            ))}
          </select>
          <label style={{ background: '#0ea5e9', color: 'white', borderRadius: 8, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {fotoYukleniyor ? <Activity size={16} /> : <Camera size={16} />}
            {fotoYukleniyor ? 'Yükleniyor...' : 'Fotoğraf Yükle'}
            <input type="file" hidden accept="image/*" onChange={fotoYukle} disabled={fotoYukleniyor} />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setGaleriFiltresi('Tümü')} style={{ border: 'none', borderRadius: 18, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', background: galeriFiltresi === 'Tümü' ? '#0f172a' : '#e2e8f0', color: galeriFiltresi === 'Tümü' ? '#fff' : '#334155' }}>Tümü</button>
        <button onClick={() => setGaleriFiltresi('İç Montaj')} style={{ border: 'none', borderRadius: 18, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', background: galeriFiltresi === 'İç Montaj' ? '#0ea5e9' : '#e2e8f0', color: galeriFiltresi === 'İç Montaj' ? '#fff' : '#334155' }}><Factory size={14} style={{ display: 'inline', marginRight: 5 }} /> İç Montaj</button>
        <button onClick={() => setGaleriFiltresi('Dış Montaj')} style={{ border: 'none', borderRadius: 18, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', background: galeriFiltresi === 'Dış Montaj' ? '#f97316' : '#e2e8f0', color: galeriFiltresi === 'Dış Montaj' ? '#fff' : '#334155' }}><Building2 size={14} style={{ display: 'inline', marginRight: 5 }} /> Dış Montaj</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {filtrelenmisFotolar.map((foto) => {
          const etiket = foto.notlar || 'Genel';
          const yol = `${API_BASE_URL}/${String(foto.file_path || '').replace(/\\/g, '/')}`;
          return (
            <div key={foto.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
              <button disabled={silinenFotoId === foto.id} onClick={() => fotoSil(foto.id)} style={{ position: 'absolute', right: 8, top: 8, zIndex: 2, border: 'none', background: 'rgba(239,68,68,.9)', color: 'white', borderRadius: 8, padding: 6, cursor: silinenFotoId === foto.id ? 'not-allowed' : 'pointer', opacity: silinenFotoId === foto.id ? 0.6 : 1 }}>
                {silinenFotoId === foto.id ? <Activity size={14} /> : <Trash2 size={14} />}
              </button>
              <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, borderRadius: 6, padding: '3px 7px', fontSize: 11, fontWeight: 900, color: 'white', background: etiket === 'Dış Montaj' ? '#f97316' : '#0ea5e9' }}>
                {etiket.toUpperCase()}
              </div>
              <div
                onClick={() => fotoDetayinaAc(foto, filtrelenmisFotolar.findIndex((x) => x.id === foto.id))}
                style={{ height: 180, cursor: 'zoom-in', backgroundImage: `url("${yol}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
              <div style={{ padding: 10, fontSize: 12, color: '#475569' }}>
                <div style={{ fontWeight: 800, color: '#1e293b' }}>{foto.yukleyen || '-'}</div>
                <div>{foto.tarih || '-'}</div>
              </div>
            </div>
          );
        })}
      </div>

      {filtrelenmisFotolar.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 700, padding: '32px 0' }}>
          {aktifProje ? 'Bu filtrede fotoğraf bulunamadı.' : 'Önce proje seçin.'}
        </div>
      )}

      {galeriYukleniyor && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, background: '#0f172a', color: 'white', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1200, boxShadow: '0 8px 20px rgba(0,0,0,.25)' }}>
          <Activity size={16} className="spin" />
          <span style={{ fontWeight: 700, fontSize: 12 }}>Galeri güncelleniyor...</span>
        </div>
      )}

      {tamEkranFoto && (
        <div onClick={() => setTamEkranFoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setTamEkranFoto(null)} style={{ position: 'absolute', right: 24, top: 24, border: 'none', background: 'transparent', color: 'white', cursor: 'pointer', zIndex: 2 }}>
            <X size={34} />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '92vw', maxWidth: 1100, maxHeight: '90vh', background: '#0f172a', borderRadius: 12, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px' }}
          >
            <div style={{ background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360, position: 'relative', overflow: 'auto' }}>
              <button
                onClick={() => detayGezin(-1)}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'rgba(15,23,42,.65)', color: 'white', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}
              >
                ‹
              </button>
              <img src={tamEkranFoto.url} alt="Tam ekran" style={{ maxWidth: '100%', maxHeight: '86vh', objectFit: 'contain', transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform .15s ease' }} />
              <button
                onClick={() => detayGezin(1)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'rgba(15,23,42,.65)', color: 'white', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}
              >
                ›
              </button>
            </div>
            <div style={{ background: '#ffffff', padding: 16, overflowY: 'auto' }}>
              <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: 10 }}>Foto Detayı</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))} style={{ border: '1px solid #cbd5e1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 800 }}>-</button>
                <button onClick={() => setZoom(1)} style={{ border: '1px solid #cbd5e1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 800 }}>100%</button>
                <button onClick={() => setZoom((z) => Math.min(4, Number((z + 0.2).toFixed(2))))} style={{ border: '1px solid #cbd5e1', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 800 }}>+</button>
                <span style={{ alignSelf: 'center', fontSize: 12, color: '#475569', fontWeight: 700 }}>{Math.round(zoom * 100)}%</span>
              </div>
              <div style={{ fontSize: 13, color: '#334155', display: 'grid', gap: 8 }}>
                <div><strong>Proje:</strong> {tamEkranFoto.proje}</div>
                <div><strong>Yükleyen:</strong> {tamEkranFoto.yukleyen}</div>
                <div><strong>Tarih:</strong> {tamEkranFoto.tarih}</div>
                <div><strong>Aşama:</strong> {tamEkranFoto.asama}</div>
                <div><strong>Dosya:</strong> {tamEkranFoto.dosya}</div>
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
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel}
      />
      <UnimakToast open={toastState.open} message={toastState.message} variant={toastState.variant} toastId={toastState.id} durationMs={toastState.durationMs} onClose={dismissToast} />
    </div>
  );
}

