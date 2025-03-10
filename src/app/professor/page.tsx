'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ClassNameDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { listenForQuestions, deleteQuestion } from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { createClassSession } from '@/lib/classSession';
import { Question } from '@/types';

export default function ProfessorPage() {
  const router = useRouter();
  const [className, setClassName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    // Check if user is a professor
    if (!isProfessor()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setProfessorId(userId);
    console.log("Professor ID:", userId);

    // Check Firebase connection
    const checkConnection = async () => {
      try {
        const isConnected = await checkFirebaseConnection();
        setConnectionStatus(isConnected ? 'connected' : 'error');
        
        if (!isConnected) {
          setError("Failed to connect to the database. Please check your internet connection.");
          setIsLoading(false);
          return;
        }
        
        // Initialize class
        if (userId) {
          await initializeClass(userId);
        }
      } catch (error) {
        console.error("Connection check error:", error);
        setConnectionStatus('error');
        setError("Failed to check database connection. Please refresh the page.");
        setIsLoading(false);
      }
    };
    
    checkConnection();
  }, [router]);

  const initializeClass = async (userId: string) => {
    try {
      console.log("Starting class initialization for user:", userId);
      
      // Get existing class for this professor
      const existingClassName = await getClassForProfessor(userId);
      console.log("Existing class result:", existingClassName);
      
      if (existingClassName) {
        setClassName(existingClassName);
      }
      
      // Create a session ID if we don't have one
      if (!sessionId && existingClassName) {
        try {
          const newSessionId = await createClassSession(existingClassName, userId);
          setSessionId(newSessionId);
          console.log("Created new session ID:", newSessionId);
        } catch (err) {
          console.error("Error creating session:", err);
          // Use a fallback session ID if creation fails
          setSessionId('fallback-session-id');
        }
      }
      
      // Start listening for questions if we have a class name
      if (existingClassName) {
        const unsubscribe = listenForQuestions(existingClassName, (newQuestions) => {
          setQuestions(newQuestions);
          setIsLoading(false);
        });
        
        // Cleanup function
        return () => {
          unsubscribe();
        };
      } else {
        // No class yet, just stop loading
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error initializing class:", error);
      setError("Failed to initialize class. Please refresh the page.");
      setIsLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteQuestion(id);
      // The questions list will update automatically via the listener
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  const handleClassNameChange = (newClassName: string) => {
    setClassName(newClassName);
    
    // Start listening for questions with the new class name
    if (newClassName) {
      const unsubscribe = listenForQuestions(newClassName, (newQuestions) => {
        setQuestions(newQuestions);
      });
      
      // We don't need to return the unsubscribe function here since this isn't a useEffect
      // The old listener will be replaced when this function is called again
    }
  };

  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

  const handleRetry = async () => {
    setError(null);
    setConnectionStatus('checking');
    const userId = getUserId();
    if (userId) {
      await initializeClass(userId);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-8 text-3xl font-bold text-text dark:text-dark-text">Professor Dashboard</h1>
          
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
              <button 
                onClick={handleRetry}
                className="mt-4 rounded-md bg-error-dark px-4 py-2 text-sm font-medium text-white hover:bg-error-dark/90 dark:bg-error-light dark:text-error-dark dark:hover:bg-error-light/90"
              >
                Retry Connection
              </button>
            </div>
          )}

          <div className="mb-8">
            <ClassNameDisplay 
              className={className} 
              professorId={professorId}
              sessionId={sessionId || 'fallback-session-id'}
              onClassNameChange={handleClassNameChange}
            />
          </div>

          {className && (
            <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
              <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Questions</h2>
              <QuestionList 
                questions={questions} 
                isProfessor={true}
                onDelete={handleDeleteQuestion}
                emptyMessage="No questions yet. Share your class name with students to get started."
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 