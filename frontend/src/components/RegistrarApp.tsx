'use client';
import { useEffect } from 'react';
import { carregarConfig } from '@/lib/config';

/** Registra o service worker (site instalável como aplicativo) e liga o Sentry se configurado. */
export function RegistrarApp() {
  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    carregarConfig()
      .then(async (c) => {
        if (!c.sentryDsn) return;
        const Sentry = await import('@sentry/browser');
        Sentry.init({ dsn: c.sentryDsn, environment: c.ambiente, tracesSampleRate: 0, sendDefaultPii: false });
      })
      .catch(() => undefined);
  }, []);
  return null;
}
