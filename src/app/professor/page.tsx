'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ClassNameDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { 
  listenForQuestions, 
  deleteQuestion, 
  addActiveQuestion, 
  listenForAnswers,
  updateStudentPoints
} from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { createClassSession } from '@/lib/classSession';
import { Question } from '@/types';

type TabType = 'questions' | 'points';

export default function ProfessorPage() {
  const router = useRouter();
  const [className, setClassName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  
  // Points tab state
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{id: string, text: string, timestamp: number, studentId: string}[]>([]);

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

  // Set up answers listener when activeQuestionId changes
  useEffect(() => {
    if (!activeQuestionId) return () => {};
    
    console.log("Setting up answers listener for question:", activeQuestionId);
    const unsubscribe = listenForAnswers(activeQuestionId, (newAnswers) => {
      console.log("Received answers update:", newAnswers);
      setAnswers(newAnswers);
    });
    
    return () => {
      console.log("Cleaning up answers listener");
      unsubscribe();
    };
  }, [activeQuestionId]);

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
  
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };
  
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim() || !professorId || !className) {
      console.error("Missing required fields for asking a question");
      return;
    }
    
    try {
      const newQuestionId = await addActiveQuestion(questionText, professorId, className);
      if (newQuestionId) {
        console.log("New active question created with ID:", newQuestionId);
        setActiveQuestionId(newQuestionId);
        // Clear answers when a new question is asked
        setAnswers([]);
      }
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };
  
  const handleRewardPoints = async (studentId: string, points: number) => {
    try {
      await updateStudentPoints(studentId, points);
      // Show success message or feedback
      console.log(`Awarded ${points} points to student ${studentId}`);
    } catch (error) {
      console.error("Error awarding points:", error);
      setError("Failed to award points. Please try again.");
    }
  };
  
  const renderQuestionsTab = () => (
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
  );
  
  const renderPointsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left container - Class name and Ask Question */}
      <div className="flex flex-col space-y-6">
        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
          <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Ask Students a Question</h2>
          
          <form onSubmit={handleAskQuestion}>
            <div className="mb-4">
              <label htmlFor="questionText" className="mb-2 block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                Question Text
              </label>
              <textarea
                id="questionText"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-4 py-2 text-text focus:border-primary focus:outline-none dark:border-dark-border dark:bg-dark-background-secondary dark:text-dark-text dark:focus:border-dark-primary"
                rows={3}
                placeholder="Type your question here..."
                required
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary"
            >
              Ask Question
            </button>
          </form>
        </div>
        
        {activeQuestionId && (
          <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
            <h3 className="mb-2 text-lg font-medium text-text dark:text-dark-text">Current Question</h3>
            <div className="rounded-md bg-background-secondary p-4 dark:bg-dark-background">
              <p className="text-text dark:text-dark-text">{questionText}</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Right container - Student Answers */}
      <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
        <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Answers</h2>
        
        {activeQuestionId ? (
          answers.length > 0 ? (
            <ul className="space-y-4">
              {answers.map((answer) => (
                <li key={answer.id} className="rounded-md bg-background-secondary p-4 dark:bg-dark-background relative">
                  <p className="text-text dark:text-dark-text">{answer.text}</p>
                  <p className="mt-1 text-xs text-text-secondary dark:text-dark-text-secondary">
                    Student ID: {answer.studentId.substring(0, 8)}...
                  </p>
                  
                  {/* Point reward buttons */}
                  <div className="absolute bottom-4 right-4 flex space-x-2">
                    {[1, 2, 3, 4, 5].map((points) => (
                      <button
                        key={points}
                        onClick={() => handleRewardPoints(answer.studentId, points)}
                        className="h-8 w-8 rounded-full bg-primary text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary"
                      >
                        {points}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-secondary dark:text-dark-text-secondary">No answers yet.</p>
          )
        ) : (
          <p className="text-text-secondary dark:text-dark-text-secondary">Ask a question to see student answers.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-text dark:text-dark-text">Professor Dashboard</h1>
            
            <div className="flex space-x-2 rounded-md bg-background-secondary p-1 dark:bg-dark-background-secondary">
              <button
                onClick={() => handleTabChange('questions')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'questions'
                    ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text'
                    : 'text-text hover:bg-background-tertiary dark:text-dark-text dark:hover:bg-dark-background-tertiary'
                }`}
              >
                Questions
              </button>
              <button
                onClick={() => handleTabChange('points')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'points'
                    ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text'
                    : 'text-text hover:bg-background-tertiary dark:text-dark-text dark:hover:bg-dark-background-tertiary'
                }`}
              >
                Points
              </button>
            </div>
          </div>
          
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
            activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()
          )}
        </div>
      </main>
    </div>
  );
} 