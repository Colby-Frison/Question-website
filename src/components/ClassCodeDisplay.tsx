'use client';

import { useState } from 'react';
import { generateClassCode, createClassCode } from '@/lib/classCode';
import { archiveClassSession, closeClassSession } from '@/lib/classSession';

interface ClassCodeDisplayProps {
  classCode: string;
  professorId: string;
  sessionId: string;
  onCodeChange: (newCode: string) => void;
}

export default function ClassCodeDisplay({ 
  classCode, 
  professorId,
  sessionId,
  onCodeChange 
}: ClassCodeDisplayProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleRegenerateCode = async () => {
    setIsGenerating(true);
    
    try {
      const newCode = generateClassCode();
      const success = await createClassCode(newCode, professorId);
      
      if (success) {
        onCodeChange(newCode);
      }
    } catch (error) {
      console.error('Error regenerating class code:', error);
    } finally {
      setIsGenerating(false);
    }
  };

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

  const handleCopyCode = () => {
    if (classCode) {
      navigator.clipboard.writeText(classCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
      <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Class Code</h2>
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:space-x-4 sm:space-y-0">
          <div className="flex flex-1 items-center">
            <div className="relative w-full">
              <div className="flex items-center rounded-md bg-background-secondary px-4 py-3 font-mono text-lg font-bold text-text dark:bg-dark-background-tertiary dark:text-dark-text">
                {classCode || 'No code generated yet'}
              </div>
              {classCode && (
                <button
                  onClick={handleCopyCode}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-secondary hover:text-text dark:text-dark-text-secondary dark:hover:text-dark-text"
                  aria-label="Copy class code"
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
              )}
            </div>
          </div>
          <button
            onClick={handleRegenerateCode}
            disabled={isGenerating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-primary/70 dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:disabled:bg-dark-primary/70"
          >
            {isGenerating ? 'Generating...' : 'Generate New Code'}
          </button>
        </div>

        <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
          <button
            onClick={handleArchiveClass}
            disabled={isArchiving}
            className="rounded-md bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-700 transition-colors hover:bg-yellow-200 disabled:bg-yellow-100/70 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50"
          >
            {isArchiving ? 'Archiving...' : 'Archive Class'}
          </button>
          <button
            onClick={handleCloseClass}
            disabled={isClosing}
            className="rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 disabled:bg-red-100/70 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          >
            {isClosing ? 'Closing...' : 'Close Class'}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-text-secondary dark:text-dark-text-secondary">
        Share this code with your students so they can join your class.
      </p>
    </div>
  );
} 