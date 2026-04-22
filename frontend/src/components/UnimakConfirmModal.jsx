import React from 'react';

const variantMap = {
  danger: {
    border: '#fecaca',
    headerBg: 'linear-gradient(90deg,#b91c1c,#ef4444)',
    confirmBg: '#ef4444',
  },
  warning: {
    border: '#fde68a',
    headerBg: 'linear-gradient(90deg,#b45309,#f59e0b)',
    confirmBg: '#d97706',
  },
  info: {
    border: '#bfdbfe',
    headerBg: 'linear-gradient(90deg,#1d4ed8,#3b82f6)',
    confirmBg: '#2563eb',
  },
};

export default function UnimakConfirmModal({
  open,
  title = 'UNIMAK ISLEM ONAYI',
  message = 'Bu islemi onayliyor musunuz?',
  variant = 'warning',
  confirmText = 'Evet, Devam Et',
  cancelText = 'Vazgec',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const palette = variantMap[variant] || variantMap.warning;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '480px', borderRadius: '18px', border: `1px solid ${palette.border}`, boxShadow: '0 20px 40px rgba(15,23,42,0.25)', overflow: 'hidden' }}>
        <div style={{ background: palette.headerBg, color: '#fff', padding: '14px 18px', fontWeight: 900, letterSpacing: 0.4 }}>
          {title}
        </div>
        <div style={{ padding: '16px 18px', color: '#334155', fontWeight: 700, whiteSpace: 'pre-line' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 18px 18px' }}>
          <button onClick={onCancel} style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }}>
            {cancelText}
          </button>
          <button onClick={onConfirm} style={{ backgroundColor: palette.confirmBg, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
