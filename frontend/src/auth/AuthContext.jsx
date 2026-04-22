import React, { createContext, useContext, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext(null);

function readStoredAuth() {
  // Uygulama her açıldığında login ekranından başlaması istendi.
  return null;
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStoredAuth());

  const login = async (kullaniciAdi, sifre) => {
    const formData = new FormData();
    formData.append('kullanici_adi', kullaniciAdi);
    formData.append('sifre', sifre);

    const response = await fetch(`${API_BASE_URL}/giris/`, { method: 'POST', body: formData });
    const data = await response.json();
    if (data.durum !== 'basarili') {
      throw new Error(data.mesaj || 'Giriş başarısız');
    }
    if ((data.user?.rol || data.rol) === 'Saha') {
      throw new Error('Saha kullanıcısı web sistemine giremez. Lütfen mobil uygulamayı kullanın.');
    }

    const nextAuth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user || { isim: data.isim, rol: data.rol, kullanici_adi: kullaniciAdi },
    };
    localStorage.setItem('unimak_auth', JSON.stringify(nextAuth));
    setAuth(nextAuth);
    return nextAuth;
  };

  const logout = () => {
    localStorage.removeItem('unimak_auth');
    setAuth(null);
  };

  const value = useMemo(
    () => ({
      auth,
      user: auth?.user || null,
      token: auth?.accessToken || null,
      isAuthenticated: Boolean(auth?.accessToken),
      login,
      logout,
    }),
    [auth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

