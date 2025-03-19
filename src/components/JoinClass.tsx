'use client';

import { useState } from 'react';
import { validateClass, joinClass } from '@/lib/classCode';
import { getSessionByCode } from '@/lib/classSession';

/**
 * Interface for JoinClass component props
 * @interface JoinClassProps
 * @property {function} onSuccess - Callback function to execute when a student successfully joins a class
 * @property {string} studentId - Unique identifier for the student
 */
interface JoinClassProps {
  onSuccess: (sessionCode: string) => void;
  studentId: string;
}

/**
 * Component for students to join a class
 * 
 * This component:
 * - Provides a form for entering a session code
 * - Validates the session code against the database
 * - Handles the join process
 * - Shows appropriate error messages
 * - Executes a callback when join is successful
 * 
 * @param {JoinClassProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function JoinClass({ onSuccess, studentId }: JoinClassProps) {
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  /**
   * Handles the class joining process
   * - Validates the session code input
   * - Checks if the session exists
   * - Adds the student to the class
   * - Shows appropriate error messages or triggers success callback
   */
  const handleJoinClass = async () => {
    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }
    
    setIsJoining(true);
    
    try {
      // First check if it's a valid session
      const session = await getSessionByCode(sessionCode);
      
      if (session) {
        // Session exists, now join the class
        const joined = await joinClass(sessionCode, studentId);
        
        if (joined) {
          setError('');
          // Pass the session code to the callback
          onSuccess(sessionCode);
        } else {
          setError('Failed to join class. Please try again.');
        }
      } else {
        setError('Invalid session code. The class may have ended or doesn\'t exist.');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
      {error && (
        <div className="mb-4 rounded-md bg-red-100 p-4 text-sm text-red-700 dark:bg-red-800/30 dark:text-red-400">
          {error}
        </div>
      )}
      
      <div className="flex flex-col space-y-4">
        <div className="flex-1">
          <label htmlFor="sessionCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Enter Session Code
          </label>
          <input
            type="text"
            id="sessionCode"
            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
            placeholder="e.g. ABC123"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            This is the code provided by your professor for the current class session.
          </p>
        </div>
        <button
          onClick={handleJoinClass}
          disabled={isJoining}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {isJoining ? 'Joining...' : 'Join Class'}
        </button>
      </div>
    </div>
  );
} 