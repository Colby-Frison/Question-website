'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';

/**
 * Interface for Navbar component props
 * @interface NavbarProps
 * @property {'student' | 'professor'} userType - The type of user currently logged in
 * @property {function} onLogout - Callback function to handle user logout/role change
 */
interface NavbarProps {
  userType: 'student' | 'professor';
  onLogout: () => void;
}

/**
 * Navigation bar component for the application
 * 
 * This component:
 * - Displays the application logo/name as a link to home
 * - Provides a button to change user role (logout)
 * - Is responsive with different layouts for mobile and desktop
 * - Includes a collapsible menu for mobile view
 * 
 * @param {NavbarProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
const Navbar: React.FC<NavbarProps> = React.memo(({ userType, onLogout }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /**
   * Toggles the mobile menu open/closed state
   */
  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
  }, []);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 dark:bg-dark-background dark:border-gray-700 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and main nav */}
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
                Classroom Q&A
              </Link>
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-dark-primary dark:text-white dark:hover:bg-dark-primary-hover"
            >
              Change Role
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:text-white dark:hover:bg-gray-800 dark:hover:text-white dark:focus:ring-dark-primary"
              aria-controls="mobile-menu"
              aria-expanded={isMenuOpen}
              onClick={toggleMenu}
            >
              <span className="sr-only">{isMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
              {!isMenuOpen ? (
                <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      {isMenuOpen && (
        <div className="sm:hidden" id="mobile-menu">
          <div className="space-y-1 px-2 pb-3 pt-2">
            <button
              onClick={onLogout}
              className="block w-full rounded-md bg-blue-500 px-3 py-2 text-base font-medium text-white hover:bg-blue-600 dark:bg-dark-primary dark:text-white dark:hover:bg-dark-primary-hover"
            >
              Change Role
            </button>
          </div>
        </div>
      )}
    </nav>
  );
});

Navbar.displayName = 'Navbar';

export default Navbar; 