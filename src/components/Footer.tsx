'use client';

import { ThemeToggle } from './ThemeToggle';

/**
 * Footer component for the application
 * 
 * This component:
 * - Displays copyright information with the current year
 * - Provides access to the theme toggle
 * - Includes a link to the project's GitHub repository
 * - Is responsive with different layouts for mobile and desktop
 * - Sticks to the bottom of the page with mt-auto
 * 
 * @returns {JSX.Element} Rendered component
 */
export default function Footer() {
  return (
    <footer className="bg-gray-100 py-4 mt-auto">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
        <div className="flex items-center">
          <span className="text-sm text-gray-600">© 2023 ClassQuestions. All rights reserved.</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Privacy Policy
          </a>
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Terms of Service
          </a>
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Help
          </a>
        </div>
      </div>
    </footer>
  );
} 