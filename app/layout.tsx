import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Endless Tales - Audio Stories for the Road',
  description: 'Listen to engaging audio stories during your commute, road trip, or long haul. Professional audio dramas designed for drivers.',
  keywords: ['audiobooks', 'audio stories', 'truckers', 'commute', 'road trip', 'audio drama'],
  authors: [{ name: 'Endless Tales' }],
  openGraph: {
    title: 'Endless Tales - Audio Stories for the Road',
    description: 'Listen to engaging audio stories during your commute, road trip, or long haul.',
    url: 'https://endless-tales.com',
    siteName: 'Endless Tales',
    locale: 'en_US',
    type: 'website',
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
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Endless Tales" />
      </head>
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
