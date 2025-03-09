'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setUserType, getUserType } from '@/lib/auth';

export default function SelectRolePage() {
  const router = useRouter();
  const [userType, setUserTypeState] = useState<'student' | 'professor' | null>(null);

  useEffect(() => {
    // Check if user type is already selected
    const currentUserType = getUserType();
    if (currentUserType === 'professor') {
      router.push('/professor');
    } else if (currentUserType === 'student') {
      router.push('/student');
    }
  }, [router]);

  const handleContinue = () => {
    if (!userType) return;
    
    // Store the user type
    setUserType(userType);
    
    // Redirect based on user type
    if (userType === 'professor') {
      router.push('/professor');
    } else {
      router.push('/student');
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary dark:text-dark-text-primary">Classroom Q&A</h1>
          <p className="mt-2 text-text-secondary dark:text-dark-text-secondary">Ask questions anonymously</p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="flex flex-col space-y-4">
            <div className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">I am a:</div>
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4">
              <button
                type="button"
                className={`flex-1 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  userType === 'student'
                    ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted'
                    : 'bg-background-secondary text-text-secondary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary/80'
                }`}
                onClick={() => setUserTypeState('student')}
              >
                <div className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Student
                </div>
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  userType === 'professor'
                    ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted'
                    : 'bg-background-secondary text-text-secondary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary/80'
                }`}
                onClick={() => setUserTypeState('professor')}
              >
                <div className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  Professor
                </div>
              </button>
            </div>
          </div>

          <div>
            <button
              onClick={handleContinue}
              disabled={!userType}
              className="flex w-full justify-center rounded-md bg-primary py-3 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 