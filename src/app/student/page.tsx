'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JoinClass from '@/components/JoinClass';
import QuestionForm from '@/components/QuestionForm';
import QuestionList from '@/components/QuestionList';
import { logout, getCurrentUser, isStudent } from '@/lib/auth';
import { getUserQuestions } from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { Question } from '@/types';

export default function StudentPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [user, setUser] = useState<{ email: string; userType: string } | null>(null);

  useEffect(() => {
    // Check if user is logged in and is a student
    if (!isStudent()) {
      router.push('/');
      return;
    }

    const currentUser = getCurrentUser();
    setUser(currentUser);

    // Check if student has already joined a class
    const joinedClass = getJoinedClass();
    if (joinedClass) {
      setClassCode(joinedClass);
      setJoined(true);
    }

    // Load student's questions from localStorage
    if (currentUser) {
      loadQuestions(currentUser.email);
    }

    // Set up interval to check for new questions
    const interval = setInterval(() => {
      if (currentUser) {
        loadQuestions(currentUser.email);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  const loadQuestions = (email: string) => {
    setMyQuestions(getUserQuestions(email));
  };

  const handleJoinSuccess = () => {
    const joinedClass = getJoinedClass();
    if (joinedClass) {
      setClassCode(joinedClass);
      setJoined(true);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleLeaveClass = () => {
    setJoined(false);
    setClassCode('');
    leaveClass();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        </div>

        {!joined ? (
          <JoinClass onJoin={handleJoinSuccess} />
        ) : (
          <>
            <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">Current Class</h2>
                  <div className="mt-2 rounded-md bg-gray-100 px-4 py-2 font-mono font-bold">
                    {classCode}
                  </div>
                </div>
                <button
                  onClick={handleLeaveClass}
                  className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Leave Class
                </button>
              </div>
            </div>

            <div className="mb-8">
              {user && <QuestionForm userEmail={user.email} />}
            </div>

            <div className="rounded-lg bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">My Questions</h2>
              <QuestionList 
                questions={myQuestions} 
                emptyMessage="You haven't asked any questions yet."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
} 