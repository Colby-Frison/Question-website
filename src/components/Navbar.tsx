'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  userType: 'student' | 'professor';
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = React.memo(({ userType, onLogout }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-background-tertiary bg-white shadow-sm dark:border-dark-background-tertiary dark:bg-dark-background dark:shadow-dark-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and main nav */}
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-primary dark:text-dark-primary">
                Classroom Q&A
              </Link>
            </div>
          </div>

          {/* Desktop menu */}
          <div className="hidden items-center sm:flex">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                {userType === 'professor' ? 'Professor' : 'Student'} Dashboard
              </span>
              <div className="ml-2">
                <ThemeToggle />
              </div>
              <button
                onClick={onLogout}
                className="rounded-md bg-background-secondary px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary dark:bg-dark-background-secondary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary"
              >
                Change Role
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center space-x-2 sm:hidden">
            <div className="mr-2">
              <ThemeToggle />
            </div>
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-background-secondary hover:text-text dark:text-dark-text-secondary dark:hover:bg-dark-background-secondary dark:hover:text-dark-text"
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
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                {userType === 'professor' ? 'Professor' : 'Student'} Dashboard
              </span>
            </div>
            <button
              onClick={onLogout}
              className="block w-full rounded-md bg-background-secondary px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary dark:bg-dark-background-secondary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary"
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