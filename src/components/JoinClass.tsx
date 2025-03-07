'use client';

import { useState } from 'react';
import { validateClassCode, joinClass } from '@/lib/classCode';

interface JoinClassProps {
  onJoin: () => void;
  studentId: string;
}

export default function JoinClass({ onJoin, studentId }: JoinClassProps) {
  const [enteredCode, setEnteredCode] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinClass = async () => {
    if (!enteredCode.trim()) {
      setError('Please enter a class code');
      return;
    }
    
    setIsJoining(true);
    
    try {
      // Validate the class code
      const isValid = await validateClassCode(enteredCode);
      
      if (isValid) {
        // Join the class
        const joined = await joinClass(enteredCode, studentId);
        
        if (joined) {
          setError('');
          onJoin();
        } else {
          setError('Failed to join class. Please try again.');
        }
      } else {
        setError('Invalid class code. Please try again.');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
      <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Join a Class</h2>
      
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-end sm:space-x-4 sm:space-y-0">
        <div className="flex-1">
          <label htmlFor="classCode" className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
            Enter Class Code
          </label>
          <input
            type="text"
            id="classCode"
            className="mt-1 block w-full rounded-md border border-background-tertiary bg-background px-3 py-2 text-text placeholder-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text dark:placeholder-dark-text-tertiary dark:focus:border-dark-primary dark:focus:ring-dark-primary"
            placeholder="e.g. ABC123"
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
          />
        </div>
        <button
          onClick={handleJoinClass}
          disabled={isJoining}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-primary/70 dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:disabled:bg-dark-primary/70"
        >
          {isJoining ? 'Joining...' : 'Join Class'}
        </button>
      </div>
    </div>
  );
} 