import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FloatingThemeToggle } from '@/components/FloatingThemeToggle';

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} flex min-h-screen flex-col bg-background text-text dark:bg-dark-background dark:text-dark-text`}>
        <ThemeProvider>
          <div className="flex flex-1 flex-col">
            {children}
          </div>
          <FloatingThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
} 