import React from 'react';
import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>Yetkisiz Erişim</h1>
        <p>Bu alana erişim izniniz yok.</p>
        <Link to="/">Panele dön</Link>
      </div>
    </div>
  );
}

