import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Archive, ClipboardList, Activity, Clock3, BellRing } from 'lucide-react';
import { fetchJson } from '../../api/http';
import { theme } from '../../theme';
import GecmisProjeler from '../GecmisProjeler';

export default function MudurPanel({ activeTab, kullanici }) {
  void kullanici;
  const [kpi, setKpi] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [completedProjects, setCompletedProjects] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [entityFocus, setEntityFocus] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [kpiData, auditData, projectsData, notificationsData] = await Promise.all([
          fetchJson('/raporlar/kpi'),
          fetchJson('/raporlar/audit?limit=60'),
          fetchJson('/is_emri_kayitlari/'),
          fetchJson('/yonetim/bildirimler?limit=20'),
        ]);
        setKpi(kpiData);
        setAuditLogs(Array.isArray(auditData) ? auditData : []);
        const closed = (Array.isArray(projectsData) ? projectsData : []).filter((p) => p?.durum === 'Tamamlandı');
        setCompletedProjects(closed);
        setNotifications(Array.isArray(notificationsData) ? notificationsData : []);
      } catch {
        // non-blocking dashboard
      } finally {
        setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const cards = useMemo(() => {
    if (!kpi) return [];
    return [
      { label: 'Toplam Proje', value: kpi.proje_toplam, icon: BarChart3 },
      { label: 'Aktif Proje', value: kpi.aktif_proje, icon: Activity },
      { label: 'Tamamlanan Proje', value: kpi.tamamlanan_proje, icon: Archive },
      { label: 'Açık İş Emri', value: kpi.is_emri_aktif, icon: ClipboardList },
    ];
  }, [kpi]);

  const fmtAction = (action) =>
    String(action || '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const parseTrDateTime = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const [datePart, timePart = '00:00'] = raw.split(' ');
    const [dd, mm, yyyy] = datePart.split('.').map((v) => Number(v));
    const [hh, min] = timePart.split(':').map((v) => Number(v));
    if (!dd || !mm || !yyyy) return null;
    return new Date(yyyy, mm - 1, dd, hh || 0, min || 0);
  };

  const inRange = (dateValue) => {
    if (!dateValue) return false;
    if (!startDate && !endDate) return true;
    const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null;
    if (start && dateValue < start) return false;
    if (end && dateValue > end) return false;
    return true;
  };

  const filteredAuditLogs = useMemo(() => {
    let filtered = auditLogs.filter((log) => inRange(parseTrDateTime(log.created_at)));
    if (entityFocus?.entityType && entityFocus?.entityId) {
      filtered = filtered.filter(
        (log) => String(log.entity_type || '') === String(entityFocus.entityType) && String(log.entity_id || '') === String(entityFocus.entityId)
      );
    }
    return filtered.slice(0, 8);
  }, [auditLogs, startDate, endDate, entityFocus]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => Number(n?.is_read) !== 1).length,
    [notifications]
  );

  const markAllNotificationsRead = async () => {
    try {
      await fetchJson('/yonetim/bildirimler/okundu-tumu', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      // ignore transient failure
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await fetchJson(`/yonetim/bildirim/${notificationId}/okundu`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: 1 } : n))
      );
    } catch {
      // ignore
    }
  };

  const openRelatedRecord = async (notification) => {
    if (!notification) return;
    await markNotificationRead(notification.id);
    if (notification.entity_type && notification.entity_id) {
      setEntityFocus({ entityType: notification.entity_type, entityId: notification.entity_id });
      return;
    }
    setEntityFocus(null);
  };

  const filteredCompletedProjects = useMemo(() => {
    if (!startDate && !endDate) return completedProjects.slice(0, 6);
    return completedProjects
      .filter((p) => {
        const year = Number(p?.yil);
        if (!year) return false;
        const projectDate = new Date(year, 11, 31, 23, 59, 59);
        return inRange(projectDate);
      })
      .slice(0, 6);
  }, [completedProjects, startDate, endDate]);

  const downloadCsv = (rows, filename) => {
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportProjectsCsv = () => {
    const rows = [
      ['kod', 'proje_adi', 'yonetici', 'durum'],
      ...filteredCompletedProjects.map((p) => [p.kod || '-', p.name || '-', p.yonetici || '-', p.durum || '-']),
    ];
    downloadCsv(rows, 'mudur_proje_ozet.csv');
  };

  const exportAuditCsv = () => {
    const rows = [
      ['aksiyon', 'zaman', 'rol', 'varlik', 'varlik_id'],
      ...filteredAuditLogs.map((l) => [
        fmtAction(l.action),
        l.created_at || '-',
        l.actor_role || 'Sistem',
        l.entity_type || '-',
        l.entity_id || '-',
      ]),
    ];
    downloadCsv(rows, 'mudur_audit_ozet.csv');
  };

  const exportPdf = () => {
    window.print();
  };

  const activeView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
          }
        }
      `}</style>
      <div
        className="print-card"
        style={{
          backgroundColor: '#fff',
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          boxShadow: theme.shadow,
          padding: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: theme.header }}>UNIMAK Müdür Operasyon Paneli</h2>
          <p style={{ margin: '6px 0 0', color: theme.textMuted, fontWeight: 600 }}>
            Stratejik KPI, kapanan projeler ve son sistem hareketleri.
          </p>
        </div>
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: '8px 10px',
            background: '#fff7ed',
            color: '#9a3412',
            fontWeight: 800,
          }}
        >
          <BellRing size={16} />
          Bildirim
          <span
            style={{
              display: 'inline-flex',
              minWidth: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: unreadCount > 0 ? '#dc2626' : '#94a3b8',
              color: '#fff',
              fontSize: 12,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
            }}
          >
            {unreadCount}
          </span>
        </div>
      </div>
      <div
        className="print-card"
        style={{
          backgroundColor: '#fff',
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 12,
          color: theme.textMuted,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Rapor aralığı: {startDate || 'Başlangıç yok'} - {endDate || 'Bitiş yok'}
      </div>
      <div
        className="no-print"
        style={{
          backgroundColor: '#fff',
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: theme.header }}>Tarih Aralığı:</strong>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px' }} />
        <span style={{ color: theme.textMuted }}>-</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px' }} />
        <button
          onClick={() => {
            setStartDate('');
            setEndDate('');
          }}
          style={{ border: `1px solid ${theme.border}`, backgroundColor: '#f8fafc', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontWeight: 700 }}
        >
          Temizle
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportProjectsCsv} style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>
            Proje CSV Al
          </button>
          <button onClick={exportAuditCsv} style={{ border: 'none', backgroundColor: '#0369a1', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>
            Audit CSV Al
          </button>
          <button onClick={exportPdf} style={{ border: 'none', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>
            PDF Al
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ backgroundColor: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 24 }}>
          Veriler yükleniyor...
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  className="print-card"
                  key={card.label}
                  style={{
                    backgroundColor: '#fff',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.textMuted, fontSize: 13, fontWeight: 700 }}>
                    <Icon size={16} />
                    {card.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: theme.header }}>{card.value ?? 0}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12 }}>
            <div className="print-card" style={{ backgroundColor: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
              <h3 style={{ margin: '0 0 10px', color: theme.header }}>Son Kapanan Projeler</h3>
              {filteredCompletedProjects.length === 0 ? (
                <div style={{ color: theme.textMuted }}>Henüz kapanan proje bulunmuyor.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredCompletedProjects.map((p) => (
                    <div key={p.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontWeight: 800, color: theme.header }}>{p.kod} - {p.name}</div>
                      <div style={{ marginTop: 4, color: theme.textMuted, fontSize: 13 }}>
                        Yönetici: {p.yonetici || 'Belirtilmemiş'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="print-card" style={{ backgroundColor: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, color: theme.header }}>Son Sistem Hareketleri</h3>
                {entityFocus && (
                  <button
                    className="no-print"
                    onClick={() => setEntityFocus(null)}
                    style={{ border: `1px solid ${theme.border}`, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Filtreyi Temizle
                  </button>
                )}
              </div>
              {filteredAuditLogs.length === 0 ? (
                <div style={{ color: theme.textMuted }}>Henüz audit kaydı görünmüyor.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredAuditLogs.map((log) => (
                    <div key={log.id} style={{ borderLeft: `3px solid ${theme.primary}`, backgroundColor: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, color: theme.header }}>{fmtAction(log.action)}</div>
                      <div style={{ marginTop: 2, color: theme.textMuted, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Clock3 size={12} />
                        {log.created_at || '-'} · {log.actor_role || 'Sistem'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="print-card" style={{ backgroundColor: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, color: theme.header, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BellRing size={16} /> Yönetim Bildirimleri
              </h3>
              <button
                className="no-print"
                onClick={markAllNotificationsRead}
                style={{ border: `1px solid ${theme.border}`, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Tumunu Okundu Yap
              </button>
            </div>
            {notifications.length === 0 ? (
              <div style={{ color: theme.textMuted }}>Aktif bildirim bulunmuyor.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.slice(0, 10).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => openRelatedRecord(n)}
                    title={n.entity_type && n.entity_id ? 'Ilgili kaydi ac' : 'Bildirim detayi'}
                    style={{
                      borderLeft: `4px solid ${n.level === 'danger' ? '#dc2626' : '#d97706'}`,
                      background: Number(n.is_read) === 1 ? '#f8fafc' : '#fff7ed',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: theme.header }}>
                      {n.title}
                      {Number(n.is_read) !== 1 && <span style={{ marginLeft: 6, color: '#dc2626', fontSize: 12 }}>(YENI)</span>}
                    </div>
                    <div style={{ marginTop: 4, color: theme.textMuted, fontSize: 13 }}>{n.message}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{n.created_at || '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (activeTab === 'aktif_projeler') return activeView;
  if (activeTab === 'gecmis_projeler') return <GecmisProjeler />;
  return activeView;
}

