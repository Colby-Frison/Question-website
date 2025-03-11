'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JoinClass from '@/components/JoinClass';
import QuestionForm from '@/components/QuestionForm';
import QuestionList from '@/components/QuestionList';
import ClassQuestionList from '@/components/ClassQuestionList';
import { clearUserType, isStudent, getUserId } from '@/lib/auth';
import { listenForUserQuestions } from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { Question } from '@/types';

export default function StudentPage() {
  const router = useRouter();
  const [className, setClassName] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [classQuestions, setClassQuestions] = useState<Question[]>([]);
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
          setClassName(joinedClass);
          setJoined(true);
          
          // Set up listener for student's questions
          const unsubscribePersonal = listenForUserQuestions(userId, joinedClass, (questions) => {
            setMyQuestions(questions);
            setIsLoading(false);
          });
          
          // Set up listener for all class questions
          const unsubscribeClass = listenForUserQuestions('', joinedClass, (questions) => {
            setClassQuestions(questions);
          });
          
          return () => {
            unsubscribePersonal();
            unsubscribeClass();
          };
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking joined class:', error);
        setError('Failed to check joined class. Please refresh the page.');
        setIsLoading(false);
      }
    };
    
    checkJoinedClass();
  }, [router]);

  const handleJoinSuccess = async () => {
    try {
      // Refresh joined class
      const joinedClass = await getJoinedClass(studentId);
      
      if (joinedClass) {
        setClassName(joinedClass);
        setJoined(true);
        
        // Set up listener for student's questions
        const unsubscribePersonal = listenForUserQuestions(studentId, joinedClass, (questions) => {
          setMyQuestions(questions);
        });
        
        // Set up listener for all class questions
        const unsubscribeClass = listenForUserQuestions('', joinedClass, (questions) => {
          setClassQuestions(questions);
        });
        
        // We don't need to return the unsubscribe function here since this isn't a useEffect
      }
    } catch (error) {
      console.error('Error after joining class:', error);
      setError('Failed to load questions. Please refresh the page.');
    }
  };

  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

  const handleLeaveClass = async () => {
    try {
      const success = await leaveClass(studentId);
      
      if (success) {
        setClassName('');
        setJoined(false);
        setMyQuestions([]);
        setClassQuestions([]);
      }
    } catch (error) {
      console.error('Error leaving class:', error);
      setError('Failed to leave class. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-8 text-3xl font-bold text-text dark:text-dark-text">Student Dashboard</h1>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
              <span className="ml-2 text-text-secondary dark:text-dark-text-secondary">Loading...</span>
            </div>
          ) : null}
          
          {error && (
            <div className="mb-8 rounded-lg bg-error-light/20 p-6 shadow-all-around dark:bg-error-light/10">
              <h2 className="mb-2 text-lg font-semibold text-error-dark dark:text-error-light">Error</h2>
              <p className="text-error-dark dark:text-error-light">{error}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left container - Personal content */}
            <div className="lg:col-span-3">
              {!joined ? (
                <div className="mb-8">
                  <JoinClass onJoin={handleJoinSuccess} studentId={studentId} />
                </div>
              ) : (
                <div className="mb-8 rounded-lg bg-white p-6 shadow-all-around dark:bg-dark-background-secondary">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-text dark:text-dark-text">Current Class</h2>
                      <p className="mt-1 text-text-secondary dark:text-dark-text-secondary">
                        {className}
                      </p>
                    </div>
                    <button
                      onClick={handleLeaveClass}
                      className="mt-4 rounded-md bg-error-light/20 px-4 py-2 text-sm font-medium text-error-dark transition-colors hover:bg-error-light/30 sm:mt-0 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20"
                    >
                      Leave Class
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mb-8">
                {!joined ? (
                  <div className="rounded-lg bg-background-secondary p-6 dark:bg-dark-background-tertiary relative">
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-dark-background/50 rounded-lg z-10">
                      <p className="text-text-secondary dark:text-dark-text-secondary font-medium">Please join a class to ask questions</p>
                    </div>
                    <div className="opacity-50 pointer-events-none">
                      <QuestionForm userIdentifier={studentId} classCode="" />
                    </div>
                  </div>
                ) : (
                  <QuestionForm userIdentifier={studentId} classCode={className} />
                )}
              </div>
              
              <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
                <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">My Questions</h2>
                {!joined ? (
                  <div className="py-8 text-center text-text-secondary dark:text-dark-text-secondary">
                    Please join a class to see your questions
                  </div>
                ) : (
                  <QuestionList 
                    questions={myQuestions} 
                    emptyMessage="You haven't asked any questions yet."
                    isLoading={isLoading}
                    isStudent={true}
                    studentId={studentId}
                  />
                )}
              </div>
            </div>
            
            {/* Right container - Class questions */}
            <div className="lg:col-span-2">
              <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary h-full">
                {!joined ? (
                  <div className="h-full flex flex-col">
                    <h2 className="text-lg font-semibold mb-4 text-text dark:text-dark-text">Class Questions</h2>
                    <div className="flex-1 flex items-center justify-center text-text-secondary dark:text-dark-text-secondary">
                      Please join a class to see questions
                    </div>
                  </div>
                ) : (
                  <ClassQuestionList
                    questions={classQuestions}
                    isLoading={isLoading}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 