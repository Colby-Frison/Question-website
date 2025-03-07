'use client';

import { ThemeToggle } from './ThemeToggle';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-background-tertiary py-3 sm:py-4 dark:border-dark-background-tertiary">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between px-4">
        <div className="mb-3 w-full text-center sm:mb-0 sm:w-auto sm:text-left">
          <p className="text-xs sm:text-sm text-text-tertiary dark:text-dark-text-tertiary">
            © {new Date().getFullYear()} Classroom Q&A
          </p>
        </div>
        
        <div className="flex w-full flex-col sm:flex-row items-center justify-center sm:space-x-4 space-y-2 sm:space-y-0 sm:w-auto sm:justify-end">
          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm text-text-tertiary dark:text-dark-text-tertiary">Theme</span>
            <ThemeToggle />
          </div>
          
          <a 
            href="https://github.com/Colby-Frison/Question-website/tree/main" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs sm:text-sm text-text-tertiary transition-colors hover:text-text-secondary dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
} 