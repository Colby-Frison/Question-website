'use client';

/**
 * Footer component for the application
 * 
 * This component:
 * - Displays copyright information with the current year
 * - Includes a link to the project's GitHub repository
 * - Is responsive with different layouts for mobile and desktop
 * - Sticks to the bottom of the page with mt-auto
 * 
 * @returns {JSX.Element} Rendered component
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-background-tertiary py-3 sm:py-4">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between px-4">
        <div className="mb-3 w-full text-center sm:mb-0 sm:w-auto sm:text-left">
          <p className="text-xs sm:text-sm text-text-tertiary">
            © {new Date().getFullYear()} Classroom Q&A
          </p>
        </div>
        
        <div className="flex w-full flex-col sm:flex-row items-center justify-center sm:space-x-4 space-y-2 sm:space-y-0 sm:w-auto sm:justify-end">
          <a 
            href="https://github.com/Colby-Frison/Question-website/tree/main" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs sm:text-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
} 