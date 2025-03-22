'use client';

import { useState, useEffect, useCallback } from 'react';
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
    <div className="flex min-h-screen flex-col bg-gray-100">
      <div className="flex flex-grow items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Classroom Q&A</h1>
            <p className="mt-2 text-gray-600">Ask questions anonymously</p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="text-sm font-medium text-gray-600">I am a:</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUserTypeState('student')}
                  className={`flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    userType === 'student'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2 h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
                    />
                  </svg>
                  Student
                </button>
                <button
                  onClick={() => setUserTypeState('professor')}
                  className={`flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    userType === 'professor'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2 h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  Professor
                </button>
              </div>
            </div>

            <button
              onClick={handleContinue}
              disabled={!userType}
              className={`w-full rounded-md bg-blue-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                !userType ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 