import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';

function Login() {
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [girisHatasi, setGirisHatasi] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const girisYap = async (e) => {
    e.preventDefault();
    setGirisHatasi('');
    setIsSubmitting(true);
    try {
      await login(kullaniciAdi, sifre);
      setIsLeaving(true);
      setTimeout(() => navigate('/'), 260);
    } catch {
      setGirisHatasi('Sunucu kapalı. Python açık mı?');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: theme.bg, fontFamily: theme.font, padding: '20px'}}>
      <div
        style={{
          backgroundColor: theme.cardBg,
          padding: '34px',
          borderRadius: theme.radiusCard,
          boxShadow: theme.shadow,
          border: `1px solid ${theme.border}`,
          width: '100%',
          maxWidth: '420px',
          opacity: isLeaving ? 0 : 1,
          transform: isLeaving ? 'translateY(14px) scale(0.98)' : 'translateY(0) scale(1)',
          animation: 'webLoginIntro 360ms ease-out',
          transition: 'all 260ms ease',
        }}
      >
        <style>{`@keyframes webLoginIntro{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
        <div style={{textAlign: 'center', marginBottom: '22px'}}>
          <div style={{backgroundColor: theme.accent, width: '52px', height: '52px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 14px', fontWeight: '800', color: 'white', fontSize: '24px'}}>U</div>
          <h2 style={{color: theme.header, margin: 0, fontWeight: '800'}}>UNİMAK ÇALIŞMA MASASI</h2>
          <p style={{color: theme.textMuted, fontSize: '14px', marginTop: '6px'}}>Makine veri yönetimi ve saha takip sistemi</p>
          <div style={{marginTop: '10px', backgroundColor: '#eff6ff', color: theme.primary, borderRadius: '10px', padding: '8px 10px', fontSize: '12px', fontWeight: '700'}}>
            WEB YONETIM GIRISI
          </div>
        </div>
        <form onSubmit={girisYap}>
          <div style={{marginBottom: '14px'}}>
            <label style={{display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px'}}>Kullanıcı Adı</label>
            <input type="text" value={kullaniciAdi} onChange={(e) => setKullaniciAdi(e.target.value)} style={{width: '100%', padding: '11px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`}} required />
          </div>
          <div style={{marginBottom: '18px'}}>
            <label style={{display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px'}}>Şifre</label>
            <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} style={{width: '100%', padding: '11px', borderRadius: theme.radiusBtn, border: `1px solid ${theme.border}`}} required />
          </div>
          {girisHatasi && <div style={{backgroundColor: '#fef2f2', color: theme.danger, padding: '10px', borderRadius: theme.radiusBtn, marginBottom: '20px', fontSize: '13px', textAlign: 'center', fontWeight: '600'}}>{girisHatasi}</div>}
          <button type="submit" disabled={isSubmitting} style={{width: '100%', padding: '12px', backgroundColor: theme.primary, color: 'white', border: 'none', borderRadius: theme.radiusBtn, fontWeight: '700', cursor: 'pointer', opacity: isSubmitting ? 0.8 : 1}}>
            {isSubmitting ? 'Giris Yapiliyor...' : 'Sisteme Giris Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;