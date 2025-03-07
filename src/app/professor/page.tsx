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
import { Question } from '@/types';

export default function ProfessorPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');
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
          setError("Could not connect to Firebase. Please check your internet connection and try again.");
          setIsLoading(false);
          return;
        }
        
        await initializeClassCode(userId);
      } catch (connectionError) {
        console.error("Connection check error:", connectionError);
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
      
      // Set up listener for questions
      try {
        console.log("Setting up questions listener for code:", code);
        const unsubscribe = listenForQuestions(code, (newQuestions) => {
          console.log("Received questions update:", newQuestions.length);
          setQuestions(newQuestions);
          setIsLoading(false);
        });
        
        return () => {
          console.log("Cleaning up questions listener");
          unsubscribe();
        };
      } catch (listenerError) {
        console.error("Error setting up questions listener:", listenerError);
        setError("Failed to listen for questions. Please refresh the page.");
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error initializing class code:', error);
      setError("Failed to initialize class. Please refresh the page.");
      setIsLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      console.log("Deleting question:", id);
      await deleteQuestion(id);
      console.log("Question deleted successfully");
      // The listener will automatically update the questions list
    } catch (error) {
      console.error('Error deleting question:', error);
      setError("Failed to delete question. Please try again.");
    }
  };

  const handleClassCodeChange = (newCode: string) => {
    console.log("Class code changed to:", newCode);
    setClassCode(newCode);
  };

  const handleLogout = () => {
    clearUserType();
  };

  const handleRetry = async () => {
    setError(null);
    setIsLoading(true);
    setConnectionStatus('checking');
    
    try {
      const isConnected = await checkFirebaseConnection();
      setConnectionStatus(isConnected ? 'connected' : 'error');
      
      if (isConnected) {
        await initializeClassCode(professorId);
      } else {
        setError("Still unable to connect to Firebase. Please check your internet connection.");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Retry error:", error);
      setError("Failed to reconnect. Please refresh the page.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-dark-background">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text dark:text-dark-text">Professor Dashboard</h1>
        </div>

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
            onCodeChange={handleClassCodeChange}
          />
        </div>

        <div className="rounded-lg bg-white p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
          <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Questions</h2>
          <QuestionList 
            questions={questions} 
            isProfessor={true} 
            onDelete={handleDeleteQuestion}
            emptyMessage="No questions yet. Waiting for students to ask questions."
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
} 