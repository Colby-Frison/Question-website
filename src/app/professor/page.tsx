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
  runDatabaseMaintenance,
  updateQuestionStatus,
  clearPointsCache
} from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { 
  createClassSession,
  endClassSession,
  updateSessionActivity,
  isSessionInactive,
  SESSION_INACTIVITY_TIMEOUT,
  forceIndexCreation
} from '@/lib/classSession';
import { ClassSession, Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';
import JoinClass from '@/components/JoinClass';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ThemeToggle } from '@/components/ThemeToggle';

// Constants for Firebase collections
const ACTIVE_QUESTION_COLLECTION = 'activeQuestions';
const ANSWERS_COLLECTION = 'answers';
const CLASS_SESSIONS_COLLECTION = 'classSessions';

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
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);

  // Tab state to switch between questions and points views
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  
  // Points tab state for managing active questions and student answers
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{id: string, text: string, timestamp: number, studentId: string, questionText?: string, activeQuestionId?: string}[]>([]);
  const [pointsAwarded, setPointsAwarded] = useState<{[answerId: string]: number}>({});
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);

  // New state for student join handling
  const [joined, setJoined] = useState(false);
  const [studentId, setStudentId] = useState('');

  // Add this state declaration with the other states
  const [activeQuestionText, setActiveQuestionText] = useState('');

  // Add this state declaration with the other states
  const [studentJoinCount, setStudentJoinCount] = useState(0);

  // Add showWelcome state near the top where other state variables are defined
  const [sessionStatus, setSessionStatus] = useState<'active' | 'closed' | 'archived'>('active');
  const [loading, setLoading] = useState(true);
  
  // Network status state
  type NetworkStatusType = 'online' | 'offline';
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusType>('online');
  
  // Add state to track welcome message visibility
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('hideWelcomeProfessor');
      return savedState ? false : true; // Show by default unless explicitly hidden
    }
    return true;
  });

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
    
    // Cleanup function
    return () => {
      // End session if active
      if (sessionActive && sessionId) {
        endClassSession(sessionId).catch(console.error);
      }
      
      // Clear points cache when component unmounts
      clearPointsCache();
      
      console.log("Professor page cleanup completed");
    };
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
   * Set up an effect to retrieve the active question text when activeQuestionId changes
   */
  useEffect(() => {
    if (!activeQuestionId) {
      setActiveQuestionText('');
      return;
    }
    
    // Retrieve the active question from Firestore
    const getActiveQuestionText = async () => {
      try {
        console.log(`Retrieving active question text for ID: ${activeQuestionId}`);
        const docRef = doc(db, ACTIVE_QUESTION_COLLECTION, activeQuestionId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setActiveQuestionText(data.text || 'No text available');
          console.log(`Retrieved active question text: ${data.text}`);
        } else {
          console.error(`Active question document ${activeQuestionId} not found`);
          setActiveQuestionText('Question not found');
        }
      } catch (error) {
        console.error(`Error retrieving active question ${activeQuestionId}:`, error);
        setActiveQuestionText('Error loading question');
      }
    };
    
    getActiveQuestionText();
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
    if (!className) {
      setError("Please enter a class name before starting a session.");
      return;
    }

    setIsStartingSession(true);
    try {
      // Create a new class session
      const result = await createClassSession(professorId, className);
      
      // Update state with the new session information
      if (result) {
        setSessionCode(result.sessionCode);
        setSessionId(result.sessionId);
        setSessionStartTime(Date.now());
        setSessionActive(true);
        console.log(`Started session with code: ${result.sessionCode}`);
      }
    } catch (error) {
      console.error("Error starting session:", error);
      setError(`Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsStartingSession(false);
    }
  };

  /**
   * End the current class session
   * Marks the session as closed in the database
   */
  const handleEndSession = async () => {
    if (!sessionId) return;
    
    setIsEndingSession(true);
    try {
      // End the current class session
      await endClassSession(sessionId);
      
      // Reset the session state
      setSessionCode('');
      setSessionId('');
      setSessionStartTime(null);
      setSessionActive(false);
      setAnswers([]);
      setActiveQuestionId(null);
      
      console.log("Session ended successfully");
    } catch (error) {
      console.error("Error ending session:", error);
      setError(`Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsEndingSession(false);
    }
  };

  /**
   * Handle deleting a student question
   * 
   * @param id - The ID of the question to delete
   */
  const handleDeleteQuestion = async (id: string) => {
    try {
      console.log(`Deleting question ${id}`);
      await deleteQuestion(id);
      
      // Update the local state immediately to remove the deleted question
      setQuestions(prevQuestions => prevQuestions.filter(q => q.id !== id));
      
      console.log(`Question ${id} deleted successfully`);
    } catch (error) {
      console.error("Error deleting question:", error);
      setError("Failed to delete question. Please try again.");
    }
  };

  /**
   * Handle updating a question's status
   * 
   * @param id - The ID of the question to update
   * @param currentStatus - The current status of the question
   */
  const handleToggleQuestionStatus = async (id: string, currentStatus: 'answered' | 'unanswered' | undefined) => {
    try {
      // Determine the new status
      const newStatus = currentStatus === 'answered' ? 'unanswered' : 'answered';
      console.log(`Updating question ${id} status to ${newStatus}`);
      
      await updateQuestionStatus(id, newStatus);
      console.log(`Question ${id} status updated to ${newStatus}`);
      
      // The questions list will update automatically via the listener
    } catch (error) {
      console.error("Error updating question status:", error);
      setError("Failed to update question status. Please try again.");
    }
  };

  /**
   * Handle changing the class name
   * Updates state and sets up new listeners for the new class
   * 
   * @param newClassName - The new class name
   */
  const handleClassNameChange = () => {
    try {
      // Check if session is active
      if (sessionCode) {
        setError("Cannot change class name during an active session.");
        return;
      }
      
      console.log(`Updated class name to: ${className}`);
    } catch (error) {
      console.error("Error changing class name:", error);
      setError("Failed to update class name. Please try again.");
    }
  };

  /**
   * Handle user logout
   * Clears user type and redirects to home page
   */
  const handleLogout = () => {
    // First clean up resources
    if (sessionActive && sessionId) {
      // End the session in the database
      endClassSession(sessionId).catch(error => {
        console.error("Error ending session during logout:", error);
      });
    }

    // Clear points cache before leaving
    clearPointsCache();
    
    // Clear local state
    setSessionActive(false);
    setSessionId('');
    setSessionCode('');
    
    // Then clear user type and redirect
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
  const handleTabChange = (tab: 'questions' | 'points') => {
    setActiveTab(tab);
    
    // Clear the active question when switching back to questions tab
    if (tab === 'questions') {
      setActiveQuestionId(null);
      setActiveQuestionText('');
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
   * Render the points awarding component with 1-5 scale
   */
  const renderPointsScale = (studentId: string, answerId: string) => {
    const currentPoints = pointsAwarded[answerId] || 0;
    const pointsOptions = [1, 2, 3, 4, 5];
    
    return (
      <div className="flex w-full mt-2">
        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 w-full">
          {pointsOptions.map((points) => (
            <button
              key={points}
              onClick={() => handleRewardPoints(studentId, points, answerId)}
              className={`flex-1 py-2 text-center font-medium border-r last:border-r-0 border-gray-300 dark:border-gray-600 transition-all ${
                currentPoints === points 
                  ? 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white transform scale-105' 
                  : currentPoints > 0 && points <= currentPoints
                    ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                    : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label={`Award ${points} point${points !== 1 ? 's' : ''}`}
              title={currentPoints === points ? `Click to remove ${points} point${points !== 1 ? 's' : ''}` : `Award ${points} point${points !== 1 ? 's' : ''}`}
            >
              {points}
            </button>
          ))}
        </div>
      </div>
    );
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
      // Check if we've already awarded points for this answer
      const previousPoints = pointsAwarded[answerId] || 0;
      
      // Skip processing if points haven't changed
      if (previousPoints === points && previousPoints !== 0) {
        console.log(`Points for answer ${answerId} already set to ${points}`);
        return;
      }
      
      // Calculate the actual point difference to apply
      let pointsDifference = 0;
      
      // If clicking the same number, unselect and remove all points
      if (previousPoints === points) {
        // This can only happen when both are non-zero (checked above)
        pointsDifference = -previousPoints;
        
        // Update UI immediately for responsiveness
        setPointsAwarded(prev => {
          const newPointsAwarded = { ...prev };
          delete newPointsAwarded[answerId];
          return newPointsAwarded;
        });
        
        console.log(`Removing ${previousPoints} points from student ${studentId} for answer ${answerId}`);
      } else {
        // Clicking a different number - calculate the difference
        pointsDifference = points - previousPoints;
        
        // Update UI immediately for responsiveness
      setPointsAwarded(prev => ({
        ...prev,
          [answerId]: points
      }));
        
        console.log(`Changing points for student ${studentId} on answer ${answerId} from ${previousPoints} to ${points} (${pointsDifference > 0 ? '+' : ''}${pointsDifference})`);
      }
      
      // Only make the database call if there's an actual change
      if (pointsDifference !== 0) {
        // Apply the points change in the database
        const success = await updateStudentPoints(studentId, pointsDifference);
        
        if (!success) {
          // Revert UI if database update failed
          if (previousPoints === points) {
            // We were trying to remove points
            setPointsAwarded(prev => ({
              ...prev,
              [answerId]: previousPoints
            }));
          } else {
            // We were trying to update to a new value
            setPointsAwarded(prev => {
              const newPointsAwarded = { ...prev };
              if (previousPoints === 0) {
                delete newPointsAwarded[answerId];
              } else {
                newPointsAwarded[answerId] = previousPoints;
              }
              return newPointsAwarded;
            });
          }
          
          throw new Error("Failed to update points in the database");
        }
        
        // Update session activity only if the update succeeded
        if (sessionId) {
          await updateSessionActivity(sessionId);
          setLastActivity(Date.now());
        }
      }
    } catch (error) {
      console.error("Error managing reward points:", error);
      setError("Failed to update student points. Please try again.");
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
  const formatSessionDuration = (sessionStartTime: number | null) => {
    if (!sessionStartTime) return "0 min";
    
    const duration = Math.floor((Date.now() - sessionStartTime) / 60000); // convert to minutes
    if (duration < 60) {
      return `${duration} min`;
    } else {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return `${hours}h ${minutes}m`;
    }
  };

  /**
   * Force index creation by making the necessary queries
   */
  const forceIndexCreation = async () => {
    setIsLoading(true);
    try {
      console.log("Attempting to force index creation...");
      
      // Index 1: Answers by activeQuestionId
      console.log("Testing index for answers by activeQuestionId");
      const q1 = query(
        collection(db, ANSWERS_COLLECTION),
        where("activeQuestionId", "==", "dummy-id")
      );
      await getDocs(q1);
      
      // Index 2: Classes by professorId
      console.log("Testing index for classes by professorId");
      const q2 = query(
        collection(db, CLASS_SESSIONS_COLLECTION),
        where("professorId", "==", "dummy-id")
      );
      await getDocs(q2);
      
      console.log("Index creation queries completed");
      setError("Check console for index creation links. If links appeared, click them to create the required indexes.");
      setIsLoading(false);
    } catch (e) {
      console.error("Error forcing index creation:", e);
      setIsLoading(false);
    }
  };
  
  /**
   * Render the questions tab content
   */
  const renderQuestionsTab = () => (
    <div>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-gray-100">
          <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Student Questions
        </h2>
        
        {questions.length > 0 ? (
          <QuestionList 
            questions={questions} 
            isProfessor={true}
            onDelete={handleDeleteQuestion}
            onToggleStatus={handleToggleQuestionStatus}
            showControls={true}
            emptyMessage="No questions yet. Students will be able to ask questions once they join."
          />
        ) : (
          <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
            <svg className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-300">No questions yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Student questions will appear here once they join and ask questions.</p>
          </div>
        )}
      </div>
    </div>
  );
  
  /**
   * Render the points tab content
   */
  const renderPointsTab = () => (
    <div>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-gray-100">
          <svg className="mr-2 h-5 w-5 text-purple-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Ask a Question
        </h2>
        
        <form onSubmit={handleAskQuestion} className="mb-4">
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter a question for students to answer..."
              className="flex-grow p-3 border rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              required
            />
            <button
              type="submit"
              className="px-4 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition duration-200 dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white font-medium"
            >
              Ask Question
            </button>
          </div>
        </form>
        
        {activeQuestionId ? (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2 flex items-center text-gray-900 dark:text-gray-100">
                <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Active Question
              </h3>
              <div className="mb-4 p-4 bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <p className="font-medium">{activeQuestionText || answers[0]?.questionText || "Loading question..."}</p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center text-gray-900 dark:text-gray-100">
                <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Student Answers
              </h3>
              
              {answers.length > 0 ? (
                <div className="space-y-4">
                  {answers.map(answer => (
                    <div key={answer.id} className="p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
                      <p className="mb-2 font-medium dark:text-gray-100">{answer.text}</p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md dark:text-gray-300">
                          Student ID: {answer.studentId.substring(0, 6)}
                        </span>
                        
                        {pointsAwarded[answer.id] ? (
                          <span className="text-sm bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full text-blue-800 dark:text-blue-300 font-medium">
                            <span className="inline-flex items-center">
                              <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {pointsAwarded[answer.id]} points awarded
                            </span>
                          </span>
                        ) : null}
                      </div>
                      
                      <div className="mt-3">
                        <p className="text-sm mb-1 font-medium text-gray-700 dark:text-gray-300">Award points:</p>
                        {renderPointsScale(answer.studentId, answer.id)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-300 mb-1">No answers yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for students to respond...</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-300 mb-1">No active question</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ask a question using the form above to get student responses and award points.</p>
          </div>
        )}
      </div>
    </div>
  );

  /**
   * Calculate remaining milliseconds until session timeout
   */
  const remainingMs = () => {
    if (!lastActivity) return SESSION_INACTIVITY_TIMEOUT;
    const elapsed = Date.now() - lastActivity;
    return Math.max(0, SESSION_INACTIVITY_TIMEOUT - elapsed);
  };

  /**
   * Handle closing the welcome message
   * Stores preference in localStorage to keep it closed between sessions
   */
  const handleCloseWelcome = useCallback(() => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideWelcomeProfessor', 'true');
    }
  }, []);

  /**
   * Reset welcome message when starting a new session
   */
  const resetWelcomeMessage = useCallback(() => {
    setShowWelcome(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hideWelcomeProfessor');
    }
  }, []);

  // Show error state if there's a problem
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="professor" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-800 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Error</h2>
            <p className="mb-4 dark:text-gray-200">{error}</p>
            <button
              onClick={handleRetry}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
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
        <Navbar userType="professor" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto dark:border-blue-400"></div>
            <p className="mt-4 text-lg dark:text-gray-200">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-background-DEFAULT">
      <Navbar
        title="Professor Dashboard"
        subtitle={className || 'No active class'}
        rightContent={
          <button
            onClick={handleLogout}
            className="flex items-center justify-center rounded-md bg-background-tertiary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background-secondary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-md bg-error-light px-4 py-3 text-error-dark dark:bg-dark-background-secondary dark:text-error-light">
            <p className="font-medium">Error: {error}</p>
            <button 
              onClick={() => setError(null)} 
              className="mt-2 text-sm font-medium text-error-dark hover:underline dark:text-error-light"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {(networkStatus as NetworkStatusType) === ('offline' as NetworkStatusType) && (
          <div className="mb-4 rounded-md bg-warning-light px-4 py-3 text-warning-dark dark:bg-dark-background-secondary dark:text-warning-light">
            <p className="flex items-center font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              You're offline. Some features may not work until you reconnect.
            </p>
          </div>
        )}

        {showWelcome && (
          <div className="mb-6 rounded-lg bg-background-secondary p-4 shadow-md dark:bg-dark-background-secondary">
            <div className="flex items-start justify-between">
              <div className="flex space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-text-primary dark:text-dark-text-DEFAULT">Welcome to the Professor Dashboard!</h3>
                  <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                    Start a class session to get a unique code for students to join. You can view student questions
                    and send them questions to answer.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowWelcome(false);
                  localStorage.setItem('hideWelcomeProfessor', 'true');
                }}
                className="ml-4 rounded p-1 text-text-tertiary hover:bg-background-tertiary hover:text-text-primary dark:text-dark-text-tertiary dark:hover:bg-dark-background-tertiary dark:hover:text-dark-text-DEFAULT"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
            <p className="mt-4 text-text-secondary dark:text-dark-text-secondary">Loading...</p>
          </div>
        ) : connectionStatus === 'error' ? (
          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4 h-16 w-16 text-error dark:text-error-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="mb-2 text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Connection Error</h2>
              <p className="mb-4 text-text-secondary dark:text-dark-text-secondary">
                {error || "Failed to connect to the database. Please check your internet connection and try again."}
              </p>
              <button
                onClick={handleRetry}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover"
              >
                Retry Connection
              </button>
            </div>
          </div>
        ) : !sessionCode ? (
          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Start a New Class Session</h2>
              <div>
                <button
                  onClick={handleClassNameChange}
                  className="rounded-md bg-background-secondary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary"
                >
                  Change Class Name
                </button>
              </div>
            </div>
            
            <div className="mb-6 rounded-lg bg-background-secondary p-4 dark:bg-dark-background-tertiary">
              <p className="mb-2 text-text-secondary dark:text-dark-text-secondary">Current Class Name</p>
              <p className="text-lg font-medium text-text-primary dark:text-dark-text-DEFAULT">{className || 'No class name set'}</p>
            </div>
            
            <div className="mb-2 text-text-secondary dark:text-dark-text-secondary">
              Starting a class session will generate a unique 6-digit code for students to join.
            </div>
            
            <button
              onClick={handleStartSession}
              disabled={!className || isStartingSession}
              className="flex w-full items-center justify-center rounded-md bg-primary py-3 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-DEFAULT dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
            >
              {isStartingSession ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting Session...
                </>
              ) : (
                'Start Class Session'
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <h1 className="text-2xl font-bold text-text-primary dark:text-dark-text-DEFAULT">{className}</h1>
                <div className="flex items-center">
                  <p className="text-text-secondary dark:text-dark-text-secondary">
                    Session Code: <span className="font-medium text-primary dark:text-dark-primary">{sessionCode}</span>
                  </p>
                  {sessionStartTime && (
                    <p className="ml-4 text-text-secondary dark:text-dark-text-secondary">
                      Duration: {formatSessionDuration(sessionStartTime)}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleTabChange('questions')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'questions' 
                      ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted' 
                      : 'bg-background-secondary text-text-primary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary'
                  }`}
                >
                  Questions
                </button>
                <button
                  onClick={() => handleTabChange('points')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'points' 
                      ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted' 
                      : 'bg-background-secondary text-text-primary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary'
                  }`}
                >
                  Points
                </button>
                <button
                  onClick={handleEndSession}
                  disabled={isEndingSession}
                  className="flex items-center rounded-md bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-dark disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-background-tertiary dark:text-error-light dark:hover:bg-dark-background-quaternary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
                >
                  {isEndingSession ? (
                    <>
                      <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Ending...
                    </>
                  ) : (
                    'End Session'
                  )}
                </button>
              </div>
            </div>

            {/* Render the active tab content */}
            {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
          </div>
        )}
      </main>
    </div>
  );
} 