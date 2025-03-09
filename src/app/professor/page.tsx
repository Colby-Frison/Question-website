'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ClassCodeDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { listenForQuestions, deleteQuestion } from '@/lib/questions';
import { generateClassCode, getClassCodeForProfessor, createClassCode } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { createClassSession } from '@/lib/classSession';
import { Question } from '@/types';

export default function ProfessorPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
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
        
        // Initialize class code
        if (userId) {
          await initializeClassCode(userId);
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

  const initializeClassCode = async (userId: string) => {
    try {
      console.log("Starting class code initialization for user:", userId);
      
      // Get existing class code for this professor
      let code = await getClassCodeForProfessor(userId);
      console.log("Existing code result:", code);
      
      // If no code exists, create one
      if (!code) {
        code = generateClassCode();
        console.log("Generated new code:", code);
        const success = await createClassCode(code, userId);
        console.log("Code creation success:", success);
        
        if (!success) {
          setError("Failed to create class code. Please try again.");
          setIsLoading(false);
          return;
        }
      }
      
      setClassCode(code);
      
      // Create a session ID if we don't have one
      if (!sessionId) {
        try {
          const newSessionId = await createClassSession(code, userId);
          setSessionId(newSessionId);
          console.log("Created new session ID:", newSessionId);
        } catch (err) {
          console.error("Error creating session:", err);
          // Use a fallback session ID if creation fails
          setSessionId('fallback-session-id');
        }
      }
      
      // Start listening for questions
      const unsubscribe = listenForQuestions(code, (newQuestions) => {
        setQuestions(newQuestions);
        setIsLoading(false);
      });
      
      // Cleanup function
      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error("Error initializing class code:", error);
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

  const handleClassCodeChange = (newCode: string) => {
    setClassCode(newCode);
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
      await initializeClassCode(userId);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <main className="flex-1 bg-background px-4 py-8 dark:bg-dark-background sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-8 text-3xl font-bold text-text dark:text-dark-text">Professor Dashboard</h1>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
              <span className="ml-2 text-text-secondary dark:text-dark-text-secondary">Loading...</span>
            </div>
          ) : null}
          
          {error && (
            <div className="mb-8 rounded-lg bg-red-50 p-6 shadow-md dark:bg-red-900/20">
              <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">Error</h2>
              <p className="text-red-600 dark:text-red-300">{error}</p>
              <button 
                onClick={handleRetry}
                className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              >
                Retry Connection
              </button>
            </div>
          )}

          <div className="mb-8">
            <ClassCodeDisplay 
              classCode={classCode} 
              professorId={professorId}
              sessionId={sessionId || 'fallback-session-id'}
              onCodeChange={handleClassCodeChange}
            />
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
            <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Questions</h2>
            <QuestionList 
              questions={questions} 
              isProfessor={true}
              onDelete={handleDeleteQuestion}
              emptyMessage="No questions yet. Share your class code with students to get started."
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>
    </div>
  );
} 