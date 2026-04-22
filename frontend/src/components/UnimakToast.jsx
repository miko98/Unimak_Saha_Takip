import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const variants = {
  success: {
    bg: '#ecfdf5',
    border: '#86efac',
    text: '#166534',
    Icon: CheckCircle2,
  },
  error: {
    bg: '#fef2f2',
    border: '#fecaca',
    text: '#991b1b',
    Icon: AlertTriangle,
  },
  info: {
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1e3a8a',
    Icon: Info,
  },
};

export default function UnimakToast({ open, message, variant = 'info', onClose, durationMs = 2600, toastId = 0 }) {
  if (!open || !message) return null;
  const style = variants[variant] || variants.info;
  const Icon = style.Icon;

  return (
    <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 4000 }}>
      <style>{`
        @keyframes unimakToastProgress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
      <div
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          color: style.text,
          borderRadius: 10,
          padding: '10px 12px 8px',
          minWidth: 260,
          maxWidth: 420,
          boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={16} />
          <span style={{ flex: 1 }}>{message}</span>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: style.text,
              cursor: 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            aria-label="Bildirimi kapat"
          >
            <X size={14} />
          </button>
        </div>
        <div
          style={{
            marginTop: 8,
            height: 3,
            background: 'rgba(15,23,42,0.12)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            key={toastId}
            style={{
              width: '100%',
              height: '100%',
              background: style.text,
              transformOrigin: 'left',
              animation: `unimakToastProgress ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
