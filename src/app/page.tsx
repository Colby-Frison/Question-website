'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, isAuthenticated } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'student' | 'professor' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user is already logged in
    if (isAuthenticated()) {
      // Redirect to the appropriate page
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.userType === 'professor') {
        router.push('/professor');
      } else if (user.userType === 'student') {
        router.push('/student');
      }
    }
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!userType) {
      setError('Please select your role');
      return;
    }
    
    // In a real app, you would validate credentials against a database
    // For this demo, we'll just simulate successful login
    login(email, userType);
    
    // Redirect based on user type
    if (userType === 'professor') {
      router.push('/professor');
    } else {
      router.push('/student');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Classroom Q&A</h1>
          <p className="mt-2 text-gray-600">Ask questions anonymously</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-primary focus:outline-none focus:ring-primary"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-primary focus:outline-none focus:ring-primary"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

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
                onClick={() => setUserType('student')}
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
                onClick={() => setUserType('professor')}
              >
                Professor
              </button>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={!userType}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-primary py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-gray-400"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 