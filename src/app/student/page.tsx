'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JoinClass from '@/components/JoinClass';
import QuestionForm from '@/components/QuestionForm';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isStudent, getUserId } from '@/lib/auth';
import { listenForUserQuestions } from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { Question } from '@/types';

export default function StudentPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is a student
    if (!isStudent()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setStudentId(userId);

    const checkJoinedClass = async () => {
      try {
        // Check if student has already joined a class
        const joinedClass = await getJoinedClass(userId);
        
        if (joinedClass) {
          setClassCode(joinedClass);
          setJoined(true);
          
          // Set up listener for student's questions
          const unsubscribe = listenForUserQuestions(userId, joinedClass, (questions) => {
            setMyQuestions(questions);
            setIsLoading(false);
          });
          
          return () => {
            unsubscribe();
          };
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking joined class:', error);
        setError('Failed to check joined class. Please try again.');
        setIsLoading(false);
      }
    };

    checkJoinedClass();
  }, [router]);

  const handleJoinSuccess = async () => {
    try {
      // Refresh the joined class
      const joinedClass = await getJoinedClass(studentId);
      
      if (joinedClass) {
        setClassCode(joinedClass);
        setJoined(true);
        
        // Set up listener for student's questions
        listenForUserQuestions(studentId, joinedClass, (questions) => {
          setMyQuestions(questions);
          setIsLoading(false);
        });
      }
    } catch (error) {
      console.error('Error handling join success:', error);
      setError('Failed to join class. Please try again.');
    }
  };

  const handleLogout = () => {
    clearUserType();
  };

  const handleLeaveClass = async () => {
    try {
      await leaveClass(studentId);
      setJoined(false);
      setClassCode('');
      setMyQuestions([]);
    } catch (error) {
      console.error('Error leaving class:', error);
      setError('Failed to leave class. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-dark-background">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text dark:text-dark-text">Student Dashboard</h1>
        </div>

        {error && (
          <div className="mb-8 rounded-lg bg-red-50 p-6 shadow-md dark:bg-red-900/20">
            <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">Error</h2>
            <p className="text-red-600 dark:text-red-300">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              Dismiss
            </button>
          </div>
        )}

        {!joined ? (
          <JoinClass onJoin={handleJoinSuccess} studentId={studentId} />
        ) : (
          <>
            <div className="mb-8 rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
              <div className="flex flex-col items-start justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
                <div>
                  <h2 className="text-xl font-semibold text-text dark:text-dark-text">Current Class</h2>
                  <div className="mt-2 rounded-md bg-background-secondary px-4 py-2 font-mono font-bold text-text dark:bg-dark-background-tertiary dark:text-dark-text">
                    {classCode}
                  </div>
                </div>
                <button
                  onClick={handleLeaveClass}
                  className="rounded-md bg-background-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-tertiary/80"
                >
                  Leave Class
                </button>
              </div>
            </div>

            <div className="mb-8">
              <QuestionForm userIdentifier={studentId} classCode={classCode} />
            </div>

            <div className="rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
              <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">My Questions</h2>
              <QuestionList 
                questions={myQuestions} 
                emptyMessage="You haven't asked any questions yet."
                isLoading={isLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
} 