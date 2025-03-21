'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Floating theme toggle button component
 * 
 * This component:
 * - Displays a fixed position button in the bottom-right corner of the screen
 * - Toggles between light and dark themes
 * - Uses appropriate icons based on current theme
 * - Handles hydration mismatches by only rendering after mount
 * - Provides visual feedback with hover effects and transitions
 * 
 * @returns {JSX.Element|null} Rendered component or null before client-side hydration
 */
export function FloatingThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  /**
   * Effect to handle client-side hydration
   * Sets mounted state to true after component mounts to avoid hydration mismatch
   */
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use the resolved theme to determine the current theme
  const currentTheme = mounted ? resolvedTheme : null;

  // Return null during server-side rendering to avoid hydration mismatches
  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-background-default border-2 border-primary shadow-[0_0_10px_rgba(73,84,100,0.5)] transition-all duration-300 hover:bg-background-secondary dark:bg-dark-background-secondary dark:border-dark-primary dark:shadow-[0_0_10px_rgba(38,40,43,0.5)] dark:hover:bg-dark-background-tertiary"
        aria-label="Toggle theme"
      >
        {currentTheme === 'dark' ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-6 w-6 text-dark-primary transition-all duration-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-6 w-6 text-primary transition-all duration-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
            />
          </svg>
        )}
      </button>
    </div>
  );
} 