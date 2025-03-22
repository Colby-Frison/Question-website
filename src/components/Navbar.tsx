'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';

/**
 * Interface for Navbar component props
 * @interface NavbarProps
 * @property {'student' | 'professor'} [userType] - The type of user currently logged in (old interface)
 * @property {function} [onLogout] - Callback function to handle user logout/role change (old interface)
 * @property {string} [title] - Title to display in the navbar (new interface)
 * @property {string} [subtitle] - Subtitle to display in the navbar (new interface)
 * @property {React.ReactNode} [rightContent] - Custom content to display on the right side (new interface)
 */
interface NavbarProps {
  userType?: 'student' | 'professor';
  onLogout?: () => void;
  title?: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
}

/**
 * Navigation bar component for the application
 * 
 * This component:
 * - Displays the application logo/name as a link to home
 * - Provides a button to change user role (logout)
 * - Is responsive with different layouts for mobile and desktop
 * - Includes a collapsible menu for mobile view
 * - Supports both old and new props interfaces
 * 
 * @param {NavbarProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
const Navbar: React.FC<NavbarProps> = React.memo(({ userType, onLogout, title, subtitle, rightContent }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /**
   * Toggles the mobile menu open/closed state
   */
  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
  }, []);

  // Determine if we're using the new or old interface
  const isNewInterface = title !== undefined || subtitle !== undefined || rightContent !== undefined;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-background-tertiary shadow-sm dark:bg-dark-background-secondary dark:border-dark-background-tertiary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and main nav */}
          <div className="flex items-center">
            {isNewInterface ? (
              <div>
                <h1 className="text-lg font-bold text-text-primary dark:text-dark-text-DEFAULT">{title || 'Classroom Q&A'}</h1>
                {subtitle && <p className="text-sm text-text-secondary dark:text-dark-text-secondary">{subtitle}</p>}
              </div>
            ) : (
              <div className="flex flex-shrink-0 items-center">
                <Link href="/" className="text-xl font-bold text-text-primary dark:text-dark-primary">
                  Classroom Q&A
                </Link>
              </div>
            )}
          </div>

          {/* Desktop menu */}
          <div className="hidden items-center sm:flex">
            {isNewInterface ? (
              rightContent
            ) : (
              <div className="flex items-center space-x-4">
                <button
                  onClick={onLogout}
                  className="rounded-md bg-background-secondary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background-tertiary border border-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:border-dark-background-tertiary dark:hover:bg-dark-background-quaternary"
                >
                  Change Role
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center space-x-2 sm:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-background-secondary hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary dark:hover:text-dark-text-DEFAULT"
              aria-expanded={isMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {/* Icon when menu is closed */}
              {!isMenuOpen ? (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      {isMenuOpen && (
        <div className="sm:hidden">
          <div className="space-y-1 px-4 pb-3 pt-2">
            {isNewInterface ? (
              <div className="py-2">{rightContent}</div>
            ) : (
              <button
                onClick={onLogout}
                className="block w-full rounded-md bg-background-secondary px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-background-tertiary border border-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:border-dark-background-tertiary dark:hover:bg-dark-background-quaternary"
              >
                Change Role
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
});

Navbar.displayName = 'Navbar';

export default Navbar; 