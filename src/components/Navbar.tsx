'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

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
    <nav className="bg-white shadow-sm dark:bg-dark-background-secondary dark:border-b dark:border-dark-background-tertiary">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and title */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-semibold text-primary dark:text-dark-primary">
                Classroom Q&amp;A
              </span>
            </Link>
          </div>

          {/* Desktop Nav Items */}
          <div className="hidden items-center sm:flex">
            <div className="ml-6 flex items-center space-x-4">
              <span className="text-text-secondary dark:text-dark-text-secondary">
                {userType === 'student' ? 'Student Dashboard' : 'Professor Dashboard'}
              </span>
              
              <ThemeToggle />
              
              <button
                onClick={onLogout}
                className="rounded-md bg-background-secondary px-3 py-2 text-text-secondary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-quaternary"
              >
                Change Role
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <ThemeToggle />
            
            <button
              type="button"
              className="ml-2 inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-background-secondary hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary dark:hover:text-dark-text-primary"
              aria-expanded="false"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="border-t border-gray-200 sm:hidden dark:border-dark-background-tertiary">
          <div className="space-y-1 px-2 pb-3 pt-2">
            <div className="flex flex-col items-start space-y-2 px-3 py-2">
              <span className="text-text-secondary dark:text-dark-text-secondary">
                {userType === 'student' ? 'Student Dashboard' : 'Professor Dashboard'}
              </span>
              
              <button
                onClick={onLogout}
                className="w-full rounded-md bg-background-secondary px-3 py-2 text-text-secondary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-quaternary"
              >
                Change Role
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
});

Navbar.displayName = 'Navbar';

export default Navbar; 