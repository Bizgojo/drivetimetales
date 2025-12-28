import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'DriveTimeTales - Audio Stories for the Road',
  description: 'Listen to engaging audio stories during your commute, road trip, or long haul. Professional audio dramas designed for drivers.',
  keywords: ['audiobooks', 'audio stories', 'truckers', 'commute', 'road trip', 'audio drama'],
  authors: [{ name: 'DriveTimeTales' }],
  openGraph: {
    title: 'DriveTimeTales - Audio Stories for the Road',
    description: 'Listen to engaging audio stories during your commute, road trip, or long haul.',
    url: 'https://drivetimetales.vercel.app',
    siteName: 'DriveTimeTales',
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
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
