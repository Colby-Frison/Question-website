'use client';

import { useState } from 'react';
import { validateClassName, formatClassName, createClass } from '@/lib/classCode';
import { archiveClassSession, closeClassSession } from '@/lib/classSession';

/**
 * Interface for the ClassNameDisplay component props
 * @interface ClassNameDisplayProps
 * @property {string} className - The current class name being displayed
 * @property {string} professorId - The unique identifier for the professor
 * @property {string} sessionId - The unique identifier for the class session
 * @property {function} [onClassNameChange] - Optional callback function when the class name changes
 */
interface ClassNameDisplayProps {
  className: string;
  professorId: string;
  sessionId: string;
  onClassNameChange?: (newClassName: string) => void;
}

/**
 * Component for displaying and managing class names for professors
 * 
 * This component allows professors to:
 * - Create a new class with a validated name
 * - View their current class name
 * - Copy the class name to clipboard to share with students
 * - Archive or close a class session
 * 
 * @param {ClassNameDisplayProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function ClassNameDisplay({ 
  className, 
  professorId,
  sessionId,
  onClassNameChange 
}: ClassNameDisplayProps) {
  const [newClassName, setNewClassName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState('');

  /**
   * Handles the creation of a new class
   * - Validates and formats the class name
   * - Creates the class in the database
   * - Updates the UI with the new class name
   * @async
   */
  const handleCreateClass = async () => {
    // Clear previous errors
    setError('');
    
    // Validate class name
    const formattedName = formatClassName(newClassName);
    if (!validateClassName(formattedName)) {
      setError('Class name must be 3-30 characters and contain only letters, numbers, and spaces.');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const success = await createClass(formattedName, professorId);
      
      if (success) {
        if (onClassNameChange) {
          onClassNameChange(formattedName);
        }
        setNewClassName('');
      } else {
        setError('This class name already exists. Please try a different name.');
      }
    } catch (error) {
      console.error('Error creating class:', error);
      setError('Failed to create class. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Handles archiving a class session
   * - Changes the session status to archived in the database
   * - UI updates are handled by the parent component
   * @async
   */
  const handleArchiveClass = async () => {
    setIsArchiving(true);
    try {
      await archiveClassSession(sessionId);
      // The professor page will handle the UI update
    } catch (error) {
      console.error('Error archiving class:', error);
    } finally {
      setIsArchiving(false);
    }
  };

  /**
   * Handles closing a class session
   * - Changes the session status to closed in the database
   * - UI updates are handled by the parent component
   * @async
   */
  const handleCloseClass = async () => {
    setIsClosing(true);
    try {
      await closeClassSession(sessionId);
      // The professor page will handle the UI update
    } catch (error) {
      console.error('Error closing class:', error);
    } finally {
      setIsClosing(false);
    }
  };

  /**
   * Handles copying the class name to clipboard
   * - Shows a temporary confirmation UI
   */
  const handleCopyClassName = () => {
    if (className) {
      navigator.clipboard.writeText(className);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-all-around transition-all dark:bg-dark-background-secondary">
      <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Your Class</h2>
      
      {error && (
        <div className="mb-4 rounded-md bg-error-light/20 p-4 text-sm text-error-dark dark:bg-error-light/10 dark:text-error-light">
          {error}
        </div>
      )}
      
      <div className="flex flex-col space-y-4">
        {!className ? (
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-end sm:space-x-4 sm:space-y-0">
            <div className="flex-1">
              <label htmlFor="className" className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                Create a Class Name
              </label>
              <input
                type="text"
                id="className"
                className="form-input"
                placeholder="e.g. Math 101"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                maxLength={30}
              />
              <p className="mt-1 text-xs text-text-tertiary dark:text-dark-text-tertiary">
                Class name must be 3-30 characters and can contain letters, numbers, and spaces.
              </p>
            </div>
            <button
              onClick={handleCreateClass}
              disabled={isCreating || !newClassName.trim()}
              className="btn-primary"
            >
              {isCreating ? 'Creating...' : 'Create Class'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:space-x-4 sm:space-y-0">
              <div className="flex flex-1 items-center">
                <div className="relative w-full">
                  <div className="flex items-center rounded-md bg-background-secondary px-4 py-3 font-medium text-lg text-text dark:bg-dark-background-tertiary dark:text-dark-text">
                    {className}
                  </div>
                  <button
                    onClick={handleCopyClassName}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-secondary hover:text-primary dark:text-dark-text-secondary dark:hover:text-dark-primary"
                    aria-label="Copy class name"
                  >
                    {isCopied ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                        <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
              <button
                onClick={handleArchiveClass}
                disabled={isArchiving}
                className="rounded-md bg-warning-light/20 px-4 py-2 text-sm font-medium text-warning-dark transition-colors hover:bg-warning-light/30 disabled:opacity-70 dark:bg-warning-light/10 dark:text-warning-light dark:hover:bg-warning-light/20"
              >
                {isArchiving ? 'Archiving...' : 'Archive Class'}
              </button>
              <button
                onClick={handleCloseClass}
                disabled={isClosing}
                className="rounded-md bg-error-light/20 px-4 py-2 text-sm font-medium text-error-dark transition-colors hover:bg-error-light/30 disabled:opacity-70 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20"
              >
                {isClosing ? 'Closing...' : 'Close Class'}
              </button>
            </div>
          </>
        )}
      </div>
      
      {className && (
        <p className="mt-2 text-sm text-text-secondary dark:text-dark-text-secondary">
          Share this class name with your students so they can join your class.
        </p>
      )}
    </div>
  );
} 