'use client';

import { useState } from 'react';
import { validateClass, joinClass } from '@/lib/classCode';

interface JoinClassProps {
  onJoin: () => void;
  studentId: string;
}

export default function JoinClass({ onJoin, studentId }: JoinClassProps) {
  const [className, setClassName] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinClass = async () => {
    if (!className.trim()) {
      setError('Please enter a class name');
      return;
    }
    
    setIsJoining(true);
    
    try {
      // Validate the class name
      const isValid = await validateClass(className);
      
      if (isValid) {
        // Join the class
        const joined = await joinClass(className, studentId);
        
        if (joined) {
          setError('');
          onJoin();
        } else {
          setError('Failed to join class. Please try again.');
        }
      } else {
        setError('Invalid class name. Please check the name and try again.');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-all-around transition-all dark:bg-dark-background-secondary">
      <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Join a Class</h2>
      
      {error && (
        <div className="mb-4 rounded-md bg-error-light/20 p-4 text-sm text-error-dark dark:bg-error-light/10 dark:text-error-light">
          {error}
        </div>
      )}
      
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-end sm:space-x-4 sm:space-y-0">
        <div className="flex-1">
          <label htmlFor="className" className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
            Enter Class Name
          </label>
          <input
            type="text"
            id="className"
            className="form-input"
            placeholder="e.g. Math 101"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          />
        </div>
        <button
          onClick={handleJoinClass}
          disabled={isJoining}
          className="btn-primary"
        >
          {isJoining ? 'Joining...' : 'Join Class'}
        </button>
      </div>
    </div>
  );
} 