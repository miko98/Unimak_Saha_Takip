import { useCallback, useEffect, useRef, useState } from 'react';

export default function useUnimakToast(autoCloseMs = 2600) {
  const [toastState, setToastState] = useState({ open: false, message: '', variant: 'info', id: 0, durationMs: autoCloseMs });
  const timerRef = useRef(null);
  const queueRef = useRef([]);
  const activeRef = useRef(false);
  const idRef = useRef(0);

  const clearToastTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showNextToast = useCallback(() => {
    clearToastTimer();
    const next = queueRef.current.shift();
    if (!next) {
      activeRef.current = false;
      setToastState((prev) => ({ ...prev, open: false }));
      return;
    }

    activeRef.current = true;
    setToastState({
      open: true,
      message: next.message,
      variant: next.variant,
      id: next.id,
      durationMs: autoCloseMs,
    });
    timerRef.current = setTimeout(() => {
      showNextToast();
    }, autoCloseMs);
  }, [autoCloseMs, clearToastTimer]);

  const showToast = useCallback((message, variant = 'info') => {
    if (!message) return;
    idRef.current += 1;
    queueRef.current.push({ id: idRef.current, message, variant });
    if (activeRef.current) return;
    showNextToast();
  }, [showNextToast]);

  const dismissToast = useCallback(() => {
    clearToastTimer();
    showNextToast();
  }, [clearToastTimer, showNextToast]);

  useEffect(() => () => {
    clearToastTimer();
    queueRef.current = [];
    activeRef.current = false;
  }, [clearToastTimer]);

  return { toastState, showToast, dismissToast };
}
