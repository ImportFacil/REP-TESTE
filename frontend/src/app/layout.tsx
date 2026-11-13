import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegistrarApp } from '@/components/RegistrarApp';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Export Fácil', template: '%s · Export Fácil' },
  description: 'Loja B2B e Painel da equipe Export Fácil',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/globo-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/globo-apple.png',
  },
  appleWebApp: { capable: true, title: 'Export Fácil', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#8a6a3f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <RegistrarApp />
      </body>
    </html>
  );
}
