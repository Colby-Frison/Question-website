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
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">Join a Class</h2>
      
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      
      <div className="flex items-end space-x-4">
        <div className="flex-1">
          <label htmlFor="classCode" className="block text-sm font-medium text-gray-700">
            Enter Class Code
          </label>
          <input
            type="text"
            id="classCode"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-primary focus:outline-none focus:ring-primary"
            placeholder="e.g. ABC123"
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
          />
        </div>
        <button
          onClick={handleJoinClass}
          disabled={isJoining}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-blue-400"
        >
          {isJoining ? 'Joining...' : 'Join Class'}
        </button>
      </div>
    </div>
  );
} 