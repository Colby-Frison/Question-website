import React from 'react';

/**
 * Interface for ThemeProvider component props
 * @interface ThemeProviderProps
 * @member {React.ReactNode} children - Child components
 */
interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Simplified ThemeProvider that just returns children
 * 
 * This is a placeholder since we've removed dark mode
 * It just renders children without any theme functionality
 * 
 * @param {ThemeProviderProps} props - Component props
 * @returns {JSX.Element} The children wrapped in a React fragment
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
} 