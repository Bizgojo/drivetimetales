import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext'
import PWABackGuard from '@/components/PWABackGuard';
import UtmCapture from '@/components/UtmCapture';
import AppShell from '@/components/AppShell';
import MetaPixel from '@/components/MetaPixel';

export const metadata: Metadata = {
  title: 'Endless Tales - Audio Stories for Your Me-Time',
  description: 'Audio stories for your me-time — commute, workout, road trip, or just relaxing. Professional audio dramas designed for drivers.',
  keywords: ['audiobooks', 'audio stories', 'truckers', 'commute', 'road trip', 'audio drama'],
  authors: [{ name: 'Endless Tales' }],
  openGraph: {
    title: 'Endless Tales - Audio Stories for Your Me-Time',
    description: 'Audio stories for your me-time — commute, workout, road trip, or just relaxing.',
    url: 'https://endless-tales.com',
    siteName: 'Endless Tales',
    locale: 'en_US',
    type: 'website',
    images: [{ url: 'https://endless-tales.com/images/og-share.png', width: 1024, height: 1024, alt: 'Endless Tales - Audio Stories for Your Me-Time' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Endless Tales - Audio Stories for Your Me-Time',
    description: 'Audio stories for your me-time — commute, workout, road trip, or just relaxing.',
    images: ['https://endless-tales.com/images/og-share.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Literata:opsz,wght@7..72,400;7..72,600;7..72,700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Endless Tales" />
      </head>
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <AuthProvider>
        <UtmCapture />
          <PWABackGuard />
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <Analytics />
        <MetaPixel />
      </body>
    </html>
  );
}
