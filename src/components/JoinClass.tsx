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
    setError('');
    
    try {
      console.log(`Attempting to join class with session code: ${sessionCode}`);
      
      // First check if it's a valid session
      const session = await getSessionByCode(sessionCode);
      
      // Log session result for debugging
      console.log("Session lookup result:", session);
      
      if (session) {
        console.log(`Valid session found: ${session.id} for class ${session.code}`);
        // Session exists, now join the class
        const joined = await joinClass(sessionCode, studentId);
        
        console.log(`Join class result: ${joined}`);
        
        if (joined) {
          setError('');
          // Pass the session code to the callback
          onSuccess(sessionCode);
        } else {
          setError('Failed to join class. Please try again.');
        }
      } else {
        console.log(`No active session found with code: ${sessionCode}`);
        setError('Invalid session code. The class may have ended or doesn\'t exist.');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setError('An error occurred when trying to join the class. Please check the console for details.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 animate-fadeIn">
          <div className="flex">
            <svg className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
      
      <div className="flex flex-col space-y-4">
        <div className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <input
              type="text"
              id="sessionCode"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 dark:bg-gray-800 dark:text-white dark:border-gray-700 dark:focus:ring-blue-400 text-lg font-medium tracking-wider placeholder-gray-400 dark:placeholder-gray-500 uppercase text-center"
              placeholder="ENTER SESSION CODE"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoFocus
            />
          </div>
        </div>
        
        <button
          onClick={handleJoinClass}
          disabled={isJoining || !sessionCode.trim()}
          className={`w-full px-4 py-3 rounded-lg font-medium text-md flex items-center justify-center transition-all duration-200 ${
            isJoining || !sessionCode.trim() 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500' 
              : 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700'
          }`}
        >
          {isJoining ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Joining...
            </>
          ) : (
            <>
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Join Class
            </>
          )}
        </button>

        <div className="flex justify-center pt-2">
          <button
            onClick={() => window.location.href = '/'}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center transition-colors"
          >
            <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
} 