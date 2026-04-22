import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

export default function KPIDashboard() {
  const [kpi, setKpi] = useState(null);

  useEffect(() => {
    const fetchKpi = async () => {
      const res = await fetch(`${API_BASE_URL}/raporlar/kpi`);
      const data = await res.json();
      setKpi(data);
    };
    fetchKpi();
  }, []);

  if (!kpi) {
    return <div style={{ padding: 24 }}>KPI verileri yükleniyor...</div>;
  }

  const cards = [
    ['Toplam Proje', kpi.proje_toplam],
    ['Aktif Proje', kpi.aktif_proje],
    ['Tamamlanan Proje', kpi.tamamlanan_proje],
    ['Toplam İş Emri', kpi.is_emri_toplam],
    ['Tamamlanan İş Emri', kpi.is_emri_tamamlanan],
    ['Açık Bakım', kpi.bakim_acik],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
      {cards.map(([label, value]) => (
        <div key={label} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

