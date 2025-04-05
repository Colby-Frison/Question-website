'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { ReactNode } from 'react';

/**
 * Interface for ThemeProvider component props
 * @interface ThemeProviderProps
 * @property {ReactNode} children - Child components to be wrapped by the theme provider
 * @property {any} [key: string] - Additional props to be passed to the underlying next-themes provider
 */
interface ThemeProviderProps {
  children: ReactNode;
  [key: string]: any;
}

/**
 * Theme provider component for the application
 * 
 * This component:
 * - Wraps the application with next-themes provider
 * - Configures theme settings (system preference, storage, transitions)
 * - Uses CSS class-based theming
 * - Allows default theme customization
 * 
 * @param {ThemeProviderProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
} 