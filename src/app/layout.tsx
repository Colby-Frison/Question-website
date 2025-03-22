import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Classroom Q&A',
  description: 'Anonymous question platform for students',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Theme script removed - now permanently light mode */}
      </head>
      <body className={`${inter.className} flex min-h-screen flex-col bg-background text-text`}>
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
} 