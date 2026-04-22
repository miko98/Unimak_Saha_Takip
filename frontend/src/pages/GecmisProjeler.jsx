import React, { useState, useEffect } from 'react';
import { Archive, Search, FileText, CalendarCheck, CheckCircle, BarChart3, Image as ImageIcon, CheckSquare, Layers, X, ListChecks } from 'lucide-react';
import { theme } from '../theme';
import { API_BASE_URL } from '../config';

function GecmisProjeler() {
  const [projeler, setProjeler] = useState([]);
  const [aramaMetni, setAramaMetni] = useState('');
  const [loading, setLoading] = useState(true);
  const [hataMesaji, setHataMesaji] = useState('');

  // Modal ve Özet Verileri İçin
  const [seciliProje, setSeciliProje] = useState(null);
  const [projeOzeti, setProjeOzeti] = useState(null);
  const [ozetYukleniyor, setOzetYukleniyor] = useState(false);

  // 1. TAMAMLANMIŞ PROJELERİ ÇEK
  useEffect(() => {
    const fetchGecmisProjeler = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/is_emri_kayitlari/`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.hata || data?.detail || 'Arşiv verileri alınamadı.');
        }
        const safe = Array.isArray(data) ? data : [];
        // Sadece "Tamamlandı" olanları filtrele
        const tamamlananlar = safe.filter(p => p.durum === 'Tamamlandı');
        setProjeler(tamamlananlar.reverse()); // En son kapanan en üstte
        setHataMesaji('');
        setLoading(false);
      } catch (error) {
        console.error("Projeler çekilemedi:", error);
        setProjeler([]);
        setHataMesaji(error.message || 'Arşiv verileri alınamadı.');
        setLoading(false);
      }
    };
    fetchGecmisProjeler();
  }, []);

  // 2. PROJE DETAYINA TIKLANDIĞINDA PYTHON'DAN ÖZET İSTE
  const projeDetayAc = async (proje) => {
    setSeciliProje(proje);
    setOzetYukleniyor(true);
    try {
      const response = await fetch(`${API_BASE_URL}/is_emri_ozeti/${proje.id}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.hata || data?.detail || 'Özet alınamadı.');
      }
      setProjeOzeti(data);
      setHataMesaji('');
    } catch (error) {
      console.error("Özet çekilemedi:", error);
      setProjeOzeti(null);
      setHataMesaji(error.message || 'Proje özeti alınamadı.');
    } finally {
      setOzetYukleniyor(false);
    }
  };

  // Arama Filtresi
  const filtrelenmisProjeler = projeler.filter(p => 
    (p.name || '').toLowerCase().includes(aramaMetni.toLowerCase()) || 
    (p.kod || '').toLowerCase().includes(aramaMetni.toLowerCase())
  );

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', userSelect: 'none'}}>
      
      {/* ÜST BAR VE ARAMA */}
      <div style={{backgroundColor: theme.header, padding: '24px 30px', borderRadius: theme.radiusCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: theme.shadow}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          <div style={{backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '12px'}}>
            <Archive size={28} color="white" />
          </div>
          <div>
            <h2 style={{margin: 0, color: 'white', fontSize: '22px', fontWeight: '800', letterSpacing: '0.5px'}}>Proje Arşivi</h2>
            <p style={{margin: '4px 0 0 0', color: '#9ca3af', fontSize: '13px'}}>Tamamlanmış ve kapatılmış projelerin salt okunur kayıtları</p>
          </div>
        </div>

        <div style={{position: 'relative', width: '300px'}}>
          <Search size={18} color="#9ca3af" style={{position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)'}}/>
          <input 
            type="text" 
            placeholder="Proje Kodu veya Adı Ara..." 
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            style={{width: '100%', padding: '12px 12px 12px 40px', borderRadius: '30px', border: '1px solid #4b5563', backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'white', outline: 'none', fontFamily: theme.font}}
          />
        </div>
      </div>

      {/* PROJE KARTLARI (GRID) */}
      {hataMesaji && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
          {hataMesaji}
        </div>
      )}
      {loading ? (
        <div style={{textAlign: 'center', padding: '50px', color: theme.textMuted}}>Arşiv taranıyor...</div>
      ) : filtrelenmisProjeler.length === 0 ? (
        <div style={{textAlign: 'center', padding: '50px', backgroundColor: 'white', borderRadius: theme.radiusCard, border: `1px dashed ${theme.border}`}}>
          <Archive size={48} color={theme.border} style={{marginBottom: '15px'}}/>
          <h3 style={{color: theme.textMuted}}>Arşivde Gösterilecek Proje Yok</h3>
          <p style={{color: '#9ca3af', fontSize: '14px'}}>Ayarlar sayfasından bir projeyi "Tamamlandı" olarak işaretlediğinizde burada listelenir.</p>
        </div>
      ) : (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px'}}>
          {filtrelenmisProjeler.map(proje => (
            <div key={proje.id} style={{backgroundColor: 'white', borderRadius: theme.radiusCard, border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow, transition: 'transform 0.2s', cursor: 'pointer'}} onClick={() => projeDetayAc(proje)} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              
              {/* Kart Üst Bilgi */}
              <div style={{backgroundColor: '#f8fafc', padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <div style={{fontSize: '11px', fontWeight: '900', color: theme.primary, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px'}}>{proje.kod}</div>
                  <div style={{fontSize: '18px', fontWeight: '800', color: theme.textMain}}>{proje.name}</div>
                </div>
                <div style={{backgroundColor: '#dcfce3', padding: '6px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <CheckCircle size={14} color="#16a34a" /> <span style={{fontSize: '11px', fontWeight: 'bold', color: '#16a34a'}}>KAPALI</span>
                </div>
              </div>

              {/* Kart Alt Bilgi */}
              <div style={{padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: theme.textMuted, fontSize: '13px'}}>
                  <CalendarCheck size={16} /> <strong>Yönetici:</strong> {proje.yonetici}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: theme.textMuted, fontSize: '13px'}}>
                  <Layers size={16} /> <strong>Gruplar:</strong> {proje.gruplar || 'Belirtilmemiş'}
                </div>
                
                <button style={{marginTop: '10px', width: '100%', padding: '10px', backgroundColor: '#f1f5f9', color: theme.textMain, border: `1px solid ${theme.border}`, borderRadius: theme.radiusBtn, fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background 0.2s'}} onMouseOver={(e) => e.target.style.backgroundColor = '#e2e8f0'} onMouseOut={(e) => e.target.style.backgroundColor = '#f1f5f9'}>
                  <BarChart3 size={16}/> Proje Kapanış Raporunu Gör
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* DETAY MODALI (PROJE KAPANIŞ RAPORU) */}
      {/* ============================================================== */}
      {seciliProje && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)'}}>
          <div style={{backgroundColor: '#f8fafc', borderRadius: '16px', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>
            
            {/* Rapor Başlığı */}
            <div style={{backgroundColor: 'white', padding: '30px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 10}}>
              <div>
                <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#fef9c3', color: '#a16207', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '900', marginBottom: '10px', letterSpacing: '1px'}}>
                  <Archive size={12}/> RESMİ ARŞİV KAYDI
                </div>
                <h2 style={{margin: '0 0 5px 0', fontSize: '24px', fontWeight: '900', color: theme.textMain}}>{seciliProje.kod} - {seciliProje.name}</h2>
                <div style={{color: theme.textMuted, fontSize: '14px', fontWeight: '600'}}>Proje Yöneticisi: {seciliProje.yonetici}</div>
              </div>
              <button onClick={() => setSeciliProje(null)} style={{background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><X size={24}/></button>
            </div>

            {/* Rapor İçeriği */}
            <div style={{padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px'}}>
              
              {ozetYukleniyor ? (
                <div style={{textAlign: 'center', padding: '40px', color: theme.primary, fontWeight: 'bold'}}>Veritabanından proje istatistikleri toplanıyor...</div>
              ) : projeOzeti ? (
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                  
                  {/* PANO İSTATİSTİĞİ */}
                  <div style={{backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '20px', boxShadow: theme.shadow}}>
                    <div style={{backgroundColor: 'rgba(37, 99, 235, 0.1)', padding: '15px', borderRadius: '50%'}}><Layers size={32} color={theme.primary}/></div>
                    <div>
                      <div style={{fontSize: '12px', color: theme.textMuted, fontWeight: 'bold', textTransform: 'uppercase'}}>Üretilen Panolar</div>
                      <div style={{fontSize: '28px', fontWeight: '900', color: theme.textMain}}>{projeOzeti.pano_tamamlanan} <span style={{fontSize: '16px', color: theme.textMuted}}>/ {projeOzeti.pano_toplam}</span></div>
                    </div>
                  </div>

                  {/* İŞ EMRİ İSTATİSTİĞİ */}
                  <div style={{backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '20px', boxShadow: theme.shadow}}>
                    <div style={{backgroundColor: 'rgba(249, 115, 22, 0.1)', padding: '15px', borderRadius: '50%'}}><CheckSquare size={32} color={theme.accent}/></div>
                    <div>
                      <div style={{fontSize: '12px', color: theme.textMuted, fontWeight: 'bold', textTransform: 'uppercase'}}>Saha İş Emirleri</div>
                      <div style={{fontSize: '28px', fontWeight: '900', color: theme.textMain}}>{projeOzeti.is_emri_tamamlanan} <span style={{fontSize: '16px', color: theme.textMuted}}>/ {projeOzeti.is_emri_toplam}</span></div>
                    </div>
                  </div>

                  {/* CHECKLIST İSTATİSTİĞİ */}
                  <div style={{backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '20px', boxShadow: theme.shadow}}>
                    <div style={{backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '50%'}}><ListChecks size={32} color={theme.success}/></div>
                    <div>
                      <div style={{fontSize: '12px', color: theme.textMuted, fontWeight: 'bold', textTransform: 'uppercase'}}>Kalite Kontrol (Checklist)</div>
                      <div style={{fontSize: '28px', fontWeight: '900', color: theme.textMain}}>{projeOzeti.checklist_tamamlanan} <span style={{fontSize: '16px', color: theme.textMuted}}>/ {projeOzeti.checklist_toplam}</span></div>
                    </div>
                  </div>

                  {/* GALERİ İSTATİSTİĞİ */}
                  <div style={{backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '20px', boxShadow: theme.shadow}}>
                    <div style={{backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '15px', borderRadius: '50%'}}><ImageIcon size={32} color="#8b5cf6"/></div>
                    <div>
                      <div style={{fontSize: '12px', color: theme.textMuted, fontWeight: 'bold', textTransform: 'uppercase'}}>Kayıtlı Fotoğraflar</div>
                      <div style={{fontSize: '28px', fontWeight: '900', color: theme.textMain}}>{projeOzeti.foto_sayisi} <span style={{fontSize: '16px', color: theme.textMuted}}>Görsel</span></div>
                    </div>
                  </div>

                </div>
              ) : null}

              {/* Sadece Görsel Maksatlı Statik PDF Butonu */}
              <div style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end'}}>
                <button style={{backgroundColor: theme.textMain, color: 'white', border: 'none', padding: '14px 24px', borderRadius: theme.radiusBtn, fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <FileText size={18}/> Detaylı PDF Raporunu İndir
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default GecmisProjeler;