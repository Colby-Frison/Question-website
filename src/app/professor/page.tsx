'use client';

/**
 * Professor Dashboard Page
 * 
 * This component serves as the main dashboard for professors, allowing them to:
 * - View and manage student questions
 * - Create and manage active questions for students to answer
 * - Award points to students for their answers
 * - Switch between questions and points tabs
 * - Start and end class sessions with unique session codes
 * 
 * The page handles real-time updates through Firebase listeners and
 * manages the professor's class session.
 */

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
  updateStudentPoints,
  runDatabaseMaintenance
} from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { 
  createClassSession,
  endClassSession,
  updateSessionActivity,
  isSessionInactive,
  SESSION_INACTIVITY_TIMEOUT
} from '@/lib/classSession';
import { ClassSession, Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';

// Define tab types for the dashboard
type TabType = 'questions' | 'points';

export default function ProfessorPage() {
  const router = useRouter();
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Tab state to switch between questions and points views
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  
  // Points tab state for managing active questions and student answers
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{id: string, text: string, timestamp: number, studentId: string, questionText?: string, activeQuestionId?: string}[]>([]);
  const [pointsAwarded, setPointsAwarded] = useState<{[answerId: string]: number}>({});
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);

  /**
   * Initial setup effect - runs once when component mounts
   * Checks if user is a professor, gets their ID, and initializes the class
   */
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

  /**
   * Effect to update session activity periodically
   * This keeps the session active and prevents it from timing out
   */
  useEffect(() => {
    if (!sessionId || !sessionActive) return;
    
    // Update activity every 5 minutes
    const activityInterval = setInterval(() => {
      updateSessionActivity(sessionId);
      setLastActivity(Date.now());
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(activityInterval);
    };
  }, [sessionId, sessionActive]);

  /**
   * Set up automatic database maintenance
   * This runs periodically to clean up orphaned data and inactive sessions
   */
  useEffect(() => {
    if (maintenanceSetup) return;
    
    // Only set up maintenance once
    const cleanupMaintenance = setupAutomaticMaintenance();
    setMaintenanceSetup(true);
    
    return () => {
      cleanupMaintenance();
    };
  }, [maintenanceSetup]);

  /**
   * Set up real-time listener for student answers when activeQuestionId changes
   * This ensures we always have the latest answers for the current question
   */
  useEffect(() => {
    if (!activeQuestionId) return () => {};
    
    console.log("Setting up answers listener for question:", activeQuestionId);
    const unsubscribe = listenForAnswers(activeQuestionId, (newAnswers) => {
      console.log("Received answers update:", newAnswers);
      setAnswers(newAnswers);
    });
    
    // Clean up listener when component unmounts or activeQuestionId changes
    return () => {
      console.log("Cleaning up answers listener");
      unsubscribe();
    };
  }, [activeQuestionId]);

  /**
   * Initialize the professor's class
   * Gets existing class info, creates a session, and sets up question listeners
   * 
   * @param userId - The professor's user ID
   * @returns A cleanup function to remove listeners
   */
  const initializeClass = async (userId: string) => {
    try {
      console.log("Starting class initialization for user:", userId);
      
      // Get existing class for this professor
      const existingClassName = await getClassForProfessor(userId);
      console.log("Existing class result:", existingClassName);
      
      if (existingClassName) {
        setClassName(existingClassName);
      }
      
      // We don't automatically create a session anymore
      // The professor needs to click "Start Class" button
      setIsLoading(false);
      
    } catch (error) {
      console.error("Error initializing class:", error);
      setError("Failed to initialize class. Please refresh the page.");
      setIsLoading(false);
    }
  };

  /**
   * Start a new class session
   * Creates a new session with a randomly generated code
   */
  const handleStartSession = async () => {
    if (!className || !professorId) {
      setError("Class name or professor ID is missing");
      return;
    }
    
    try {
      setIsLoading(true);
      const result = await createClassSession(className, professorId);
      
      setSessionId(result.sessionId);
      setSessionCode(result.sessionCode);
      setSessionActive(true);
      setSessionStartTime(Date.now());
      setLastActivity(Date.now());
      
      // Start listening for questions with the session code
      const unsubscribe = listenForQuestions(result.sessionCode, (newQuestions) => {
        setQuestions(newQuestions);
      });
      
      setIsLoading(false);
      
      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error("Error starting class session:", error);
      setError("Failed to start class session. Please try again.");
      setIsLoading(false);
    }
  };

  /**
   * End the current class session
   * Marks the session as closed in the database
   */
  const handleEndSession = async () => {
    if (!sessionId) {
      return;
    }
    
    try {
      setIsLoading(true);
      const success = await endClassSession(sessionId);
      
      if (success) {
        setSessionActive(false);
        setSessionId('');
        setSessionCode('');
        setQuestions([]);
      } else {
        setError("Failed to end class session. Please try again.");
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error ending class session:", error);
      setError("Failed to end class session. Please try again.");
      setIsLoading(false);
    }
  };

  /**
   * Handle deleting a student question
   * 
   * @param id - The ID of the question to delete
   */
  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteQuestion(id);
      // The questions list will update automatically via the listener
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  /**
   * Handle changing the class name
   * Updates state and sets up new listeners for the new class
   * 
   * @param newClassName - The new class name
   */
  const handleClassNameChange = (newClassName: string) => {
    // Can only change class name when no active session
    if (sessionActive) {
      setError("Cannot change class name during an active session. End the current session first.");
      return;
    }
    
    setClassName(newClassName);
  };

  /**
   * Handle user logout
   * Clears user type and redirects to home page
   */
  const handleLogout = () => {
    // End session if active
    if (sessionActive && sessionId) {
      endClassSession(sessionId).catch(console.error);
    }
    
    clearUserType();
    router.push('/');
  };

  /**
   * Handle retry after connection error
   * Resets error state and attempts to initialize class again
   */
  const handleRetry = async () => {
    setError(null);
    setConnectionStatus('checking');
    const userId = getUserId();
    if (userId) {
      await initializeClass(userId);
    }
  };
  
  /**
   * Handle switching between tabs (questions/points)
   * 
   * @param tab - The tab to switch to
   */
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    
    // Clear the active question when switching back to questions tab
    if (tab === 'questions') {
      setActiveQuestionId(null);
      setAnswers([]);
    }
  };
  
  /**
   * Handle asking a new active question for students to answer
   * 
   * @param e - The form submit event
   */
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim() || !sessionCode) {
      return;
    }
    
    try {
      // Add active question and get its ID back
      const id = await addActiveQuestion(sessionCode, questionText);
      
      // Set as the active question and clear form
      setActiveQuestionId(id);
      setQuestionText('');
      
      // Update session activity
      if (sessionId) {
        await updateSessionActivity(sessionId);
        setLastActivity(Date.now());
      }
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };
  
  /**
   * Award points to a student for their answer
   * 
   * @param studentId - The ID of the student to award points to
   * @param points - The number of points to award
   * @param answerId - The ID of the answer that earned the points
   */
  const handleRewardPoints = async (studentId: string, points: number, answerId: string) => {
    try {
      // First, check if we've already awarded points for this answer
      if (pointsAwarded[answerId]) {
        console.log(`Points already awarded for answer ${answerId}`);
        return;
      }
      
      // Award the points in the database
      await updateStudentPoints(studentId, points);
      
      // Mark these points as awarded to prevent duplicates
      setPointsAwarded(prev => ({
        ...prev,
        [answerId]: points
      }));
      
      // Update session activity
      if (sessionId) {
        await updateSessionActivity(sessionId);
        setLastActivity(Date.now());
      }
      
      console.log(`Awarded ${points} points to student ${studentId} for answer ${answerId}`);
    } catch (error) {
      console.error("Error rewarding points:", error);
    }
  };

  /**
   * Calculate time remaining before session auto-ends
   * Returns the time in minutes or null if no session is active
   */
  const getSessionTimeRemaining = () => {
    if (!sessionActive || !lastActivity) return null;
    
    const elapsedMs = Date.now() - lastActivity;
    const remainingMs = SESSION_INACTIVITY_TIMEOUT - elapsedMs;
    
    if (remainingMs <= 0) return 0;
    
    // Convert to minutes and round
    return Math.round(remainingMs / (60 * 1000));
  };

  /**
   * Format session duration as a readable string
   */
  const formatSessionDuration = () => {
    if (!sessionStartTime) return null;
    
    const durationMs = Date.now() - sessionStartTime;
    const hours = Math.floor(durationMs / (60 * 60 * 1000));
    const minutes = Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  /**
   * Render the questions tab content
   */
  const renderQuestionsTab = () => (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Student Questions</h2>
        {questions.length > 0 ? (
          <QuestionList 
            questions={questions} 
            onDelete={handleDeleteQuestion}
          />
        ) : (
          <p>No questions yet. Students will be able to ask questions once they join.</p>
        )}
      </div>
    </div>
  );

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Award Points</h2>
        
        <form onSubmit={handleAskQuestion} className="mb-4">
          <div className="flex items-center">
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter a question for students to answer..."
              className="flex-grow p-2 border rounded mr-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              required
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Ask Question
            </button>
          </div>
        </form>
        
        {activeQuestionId ? (
          <div>
            <h3 className="text-lg font-semibold mb-2">Active Question</h3>
            <div className="mb-4 p-3 bg-yellow-100 rounded dark:bg-yellow-800 dark:text-white">
              {questions.find(q => q.id === activeQuestionId)?.text || "Loading question..."}
            </div>
            
            <h3 className="text-lg font-semibold mb-2">Student Answers</h3>
            {answers.length > 0 ? (
              <div className="space-y-2">
                {answers.map(answer => (
                  <div key={answer.id} className="p-3 border rounded dark:border-gray-600">
                    <p className="mb-2">{answer.text}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Student {answer.studentId.substring(0, 6)}
                      </span>
                      {pointsAwarded[answer.id] ? (
                        <span className="text-green-500 font-semibold">
                          Awarded {pointsAwarded[answer.id]} points
                        </span>
                      ) : (
                        <div className="space-x-2">
                          <button
                            onClick={() => handleRewardPoints(answer.studentId, 1, answer.id)}
                            className="px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700"
                          >
                            +1 Point
                          </button>
                          <button
                            onClick={() => handleRewardPoints(answer.studentId, 2, answer.id)}
                            className="px-2 py-1 bg-green-200 text-green-800 rounded hover:bg-green-300 dark:bg-green-700 dark:text-green-100 dark:hover:bg-green-600"
                          >
                            +2 Points
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No answers yet. Waiting for students to respond...</p>
            )}
          </div>
        ) : (
          <p>Ask a question above to get student responses and award points.</p>
        )}
      </div>
    </div>
  );

  // Show error state if there's a problem
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="professor" />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-800">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Error</h2>
            <p className="mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="professor" />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-lg">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Professor Dashboard</h1>
            {className && (
              <h2 className="text-lg">Class: {className}</h2>
            )}
          </div>
          
          <div className="mt-4 md:mt-0">
            {!sessionActive && !sessionId ? (
              <div className="flex flex-col space-y-4">
                <ClassNameDisplay 
                  className={className} 
                  onClassNameChange={handleClassNameChange}
                />
                <button
                  onClick={handleStartSession}
                  disabled={!className}
                  className={`px-4 py-2 rounded ${
                    className 
                      ? 'bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  Start Class Session
                </button>
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                <div className="bg-white p-4 rounded-lg shadow dark:bg-gray-800">
                  <h3 className="text-lg font-semibold mb-2">Active Session</h3>
                  <p className="mb-2">
                    <span className="font-medium">Session Code:</span> <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded">{sessionCode}</span>
                  </p>
                  {sessionStartTime && (
                    <p className="mb-2">
                      <span className="font-medium">Duration:</span> {formatSessionDuration()}
                    </p>
                  )}
                  <p className="mb-4">
                    <span className="font-medium">Auto-end in:</span> {getSessionTimeRemaining()} minutes
                  </p>
                  <button
                    onClick={handleEndSession}
                    className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  >
                    End Class Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {sessionActive && (
          <div className="mb-6">
            <div className="border-b dark:border-gray-700">
              <div className="flex">
                <button
                  className={`px-4 py-2 ${
                    activeTab === 'questions' 
                      ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => handleTabChange('questions')}
                >
                  Student Questions
                </button>
                <button
                  className={`px-4 py-2 ${
                    activeTab === 'points' 
                      ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => handleTabChange('points')}
                >
                  Award Points
                </button>
              </div>
            </div>
            
            <div className="mt-4">
              {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
            </div>
          </div>
        )}
        
        {!sessionActive && (
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-gray-800">
            <h2 className="text-xl font-bold mb-4">Welcome to Your Dashboard</h2>
            <p className="mb-4">
              {className 
                ? "Click 'Start Class Session' to begin a new class with a randomly generated class code for students to join."
                : "First, set your class name. Then, you can start a class session."}
            </p>
            <p className="mb-2">Important notes:</p>
            <ul className="list-disc ml-6 mb-4">
              <li>Each class session creates a unique code for students to join</li>
              <li>The session will automatically end after 3 hours of inactivity</li>
              <li>You can manually end the session at any time using the "End Class Session" button</li>
              <li>Once a session ends, students will need a new code to join the next session</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
} 