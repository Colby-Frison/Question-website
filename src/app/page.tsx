'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setUserType, getUserType } from '@/lib/auth';

export default function SelectRolePage() {
  const router = useRouter();
  const [userType, setUserTypeState] = useState<'student' | 'professor' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user type is already selected
    const currentUserType = getUserType();
    if (currentUserType === 'professor') {
      router.push('/professor');
    } else if (currentUserType === 'student') {
      router.push('/student');
    } else {
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Classroom Q&A</h1>
          <p className="mt-2 text-gray-600">Ask questions anonymously</p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="flex flex-col space-y-4">
            <div className="text-sm font-medium text-gray-700">I am a:</div>
            <div className="flex space-x-4">
              <button
                type="button"
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
                  userType === 'student'
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                onClick={() => setUserTypeState('student')}
              >
                Student
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
                  userType === 'professor'
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                onClick={() => setUserTypeState('professor')}
              >
                Professor
              </button>
            </div>
          </div>

          <div>
            <button
              onClick={handleContinue}
              disabled={!userType}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-primary py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-gray-400"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 