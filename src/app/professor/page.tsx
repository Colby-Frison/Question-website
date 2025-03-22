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
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  
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
    if (!className || !professorId) {
      setError("Class name or professor ID is missing");
      return;
    }
    
    try {
      // Reset welcome message when starting a new session
      resetWelcomeMessage();
      
      setIsLoading(true);
      const result = await createClassSession(className, professorId);
      
      setSessionId(result.sessionId);
      setSessionCode(result.sessionCode);
      setSessionActive(true);
      setSessionStartTime(Date.now());
      setLastActivity(Date.now());
      
      // Start listening for questions with optimized listener (5 second delay max)
      const unsubscribe = listenForQuestions(result.sessionCode, (newQuestions) => {
        setQuestions(newQuestions);
      }, { maxWaitTime: 5000, useCache: true });
      
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
      console.log("No session ID found to end session");
      
      // Session ID is missing but we still want to reset the UI
      setSessionActive(false);
      setSessionId('');
      setSessionCode('');
      setQuestions([]);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      console.log(`Attempting to end session with ID: ${sessionId}`);
      
      // Clear answers and active question if any
      if (activeQuestionId) {
        setActiveQuestionId(null);
        setActiveQuestionText('');
        setAnswers([]);
        setPointsAwarded({});
        // Clear points cache as session is ending
        clearPointsCache();
      }
      
      try {
        // First try with the stored session ID
        const success = await endClassSession(sessionId);
        
        if (success) {
          console.log("Successfully ended session with stored ID");
          setSessionActive(false);
          setSessionId('');
          setSessionCode('');
          setQuestions([]);
          setIsLoading(false);
          return;
        }
      } catch (endError) {
        // If the session doesn't exist with this ID, try to find it by session code
        console.error("Error ending session with stored ID:", endError);
        console.log("Trying alternative method to end session...");
      }
      
      // Try to find the session by session code as a fallback
      if (sessionCode) {
        try {
          console.log(`Looking up session by code: ${sessionCode}`);
          const q = query(
            collection(db, 'classSessions'),
            where('sessionCode', '==', sessionCode),
            where('status', '==', 'active'),
            limit(1)
          );
          
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const actualSessionId = querySnapshot.docs[0].id;
            console.log(`Found session with ID: ${actualSessionId}`);
            
            // Try to end with the correct session ID
            const success = await endClassSession(actualSessionId);
            
            if (success) {
              console.log("Successfully ended session with looked up ID");
              setSessionActive(false);
              setSessionId('');
              setSessionCode('');
              setQuestions([]);
              setIsLoading(false);
              return;
            }
          } else {
            console.log("No active session found with this code");
          }
        } catch (lookupError) {
          console.error("Error looking up session by code:", lookupError);
        }
      }
      
      // If we get here, we couldn't end the session through normal means
      // Just reset the UI state anyway
      console.log("Couldn't properly end session, but resetting UI state");
      setError("Warning: Session data may not have been properly cleaned up in the database.");
      setSessionActive(false);
      setSessionId('');
      setSessionCode('');
      setQuestions([]);
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error in overall end session process:", error);
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
    <div className="space-y-4">
      {/* Questions container with dark mode styling */}
      <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Student Questions</h2>
        {questions.length === 0 ? (
          <div className="rounded-md bg-background-secondary p-4 text-center text-text-secondary dark:bg-dark-background-tertiary dark:text-dark-text-secondary">
            No questions yet.
          </div>
        ) : (
          <QuestionList 
            questions={questions} 
            isProfessor={true}
            onDelete={handleDeleteQuestion} 
            onToggleStatus={handleToggleQuestionStatus}
            showControls={true}
          />
        )}
      </div>
    </div>
  );
  
  /**
   * Render the points tab content
   */
  const renderPointsTab = () => (
    <div className="space-y-4">
      {/* Active question form with dark mode styling */}
      <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Ask the Class</h2>
        
        <form onSubmit={handleAskQuestion} className="space-y-4">
          <div>
            <label 
              htmlFor="question-text" 
              className="mb-1 block text-sm font-medium text-text-primary dark:text-dark-text-primary"
            >
              Question Text
            </label>
            <textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Type your question here..."
              className="w-full rounded-md border border-background-tertiary bg-white px-3 py-2 text-text placeholder-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text dark:placeholder-dark-text-tertiary dark:focus:border-dark-primary dark:focus:ring-dark-primary"
              rows={3}
              required
            />
          </div>
          
          <div>
            <button
              type="submit"
              disabled={!questionText.trim() || !!activeQuestionId}
              className="rounded-md bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-secondary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
            >
              Ask Question
            </button>
          </div>
        </form>
      </div>

      {/* Active question display with dark mode styling */}
      {activeQuestionId && (
        <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">Active Question</h2>
            <button
              onClick={handleAskQuestion}
              className="rounded-md bg-error px-3 py-1 text-sm text-white hover:bg-error-dark dark:bg-error dark:text-dark-text-inverted dark:hover:bg-error-dark"
            >
              End Question
            </button>
          </div>
          
          <div className="mb-4 rounded-md bg-background-secondary p-4 text-text-primary dark:bg-dark-background-tertiary dark:text-dark-text-primary">
            {activeQuestionText}
          </div>
          
          <h3 className="mb-2 text-lg font-medium text-text-primary dark:text-dark-text-primary">Student Answers</h3>
          
          {answers.length === 0 ? (
            <div className="rounded-md bg-background-secondary p-4 text-center text-text-secondary dark:bg-dark-background-tertiary dark:text-dark-text-secondary">
              No answers yet.
            </div>
          ) : (
            <div className="space-y-4">
              {answers.map((answer) => (
                <div 
                  key={answer.id} 
                  className="rounded-md border border-background-tertiary p-4 dark:border-dark-background-tertiary"
                >
                  <p className="mb-3 text-text-primary dark:text-dark-text-primary">{answer.text}</p>
                  
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-text-secondary dark:text-dark-text-secondary">
                      {new Date(answer.timestamp).toLocaleString()}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {renderPointsScale(answer.studentId, answer.id)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background-default">
      <Navbar 
        onLogout={handleLogout}
        userType="professor"
      />
      
      <main className="flex-grow p-4">
        <div className="mx-auto max-w-6xl space-y-6">
          
          {/* Welcome banner - with dark mode styling */}
          {showWelcome && (
            <div className="flex items-center justify-between rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
              <div>
                <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">👋 Welcome to Your Professor Dashboard</h2>
                <p className="mt-1 text-text-secondary dark:text-dark-text-secondary">
                  Manage your class, view student questions, and award points.
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowWelcome(false);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('hideWelcomeProfessor', 'true');
                  }
                }}
                className="rounded-md bg-background-secondary p-2 text-text-secondary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-quaternary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          
          {/* Error state - with dark theme styling */}
          {error && (
            <div className="rounded-lg bg-error-light/30 p-4 text-error-dark dark:bg-error-light/20 dark:text-error-light">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-error-dark dark:text-error-light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1 md:flex md:justify-between">
                  <p>{error}</p>
                  <button 
                    onClick={handleRetry}
                    className="ml-3 whitespace-nowrap text-sm font-medium text-error-dark underline dark:text-error-light"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Network status alert - with dark mode styling */}
          {networkStatus === 'offline' && (
            <div className="rounded-lg bg-warning-light/30 p-4 text-warning-dark dark:bg-warning-light/20 dark:text-warning-light">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-warning-dark dark:text-warning-light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p>You are currently offline. Some features may be unavailable until connection is restored.</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Class management - with dark mode styling */}
          <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">Class Management</h2>
                {className && <p className="text-text-secondary dark:text-dark-text-secondary">Class: {className}</p>}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {!sessionActive ? (
                  <button
                    onClick={handleStartSession}
                    disabled={isLoading || !className}
                    className="rounded-md bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-secondary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
                  >
                    Start Class Session
                  </button>
                ) : (
                  <button
                    onClick={handleEndSession}
                    className="rounded-md bg-error px-4 py-2 text-white transition-colors hover:bg-error-dark focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 dark:bg-error dark:text-dark-text-inverted dark:hover:bg-error-dark dark:focus:ring-error dark:focus:ring-offset-dark-background-secondary"
                  >
                    End Class Session
                  </button>
                )}
                
                <button
                  onClick={handleClassNameChange}
                  className="rounded-md border border-primary bg-transparent px-4 py-2 text-primary transition-colors hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:border-dark-primary dark:text-dark-primary dark:hover:bg-dark-primary-900/20 dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-secondary"
                >
                  Change Class Name
                </button>
              </div>
            </div>
            
            {/* If session active, show code and stats */}
            {sessionActive && (
              <div className="mt-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1 rounded-md bg-background-secondary p-4 dark:bg-dark-background-tertiary">
                    <h3 className="mb-1 text-sm font-medium text-text-secondary dark:text-dark-text-secondary">Class Code</h3>
                    <div className="text-3xl font-bold tracking-widest text-primary dark:text-dark-primary">{sessionCode}</div>
                  </div>
                  
                  <div className="flex-1 rounded-md bg-background-secondary p-4 dark:bg-dark-background-tertiary">
                    <h3 className="mb-1 text-sm font-medium text-text-secondary dark:text-dark-text-secondary">Students Joined</h3>
                    <div className="text-3xl font-bold text-text-primary dark:text-dark-text-primary">{studentJoinCount}</div>
                  </div>
                  
                  <div className="flex-1 rounded-md bg-background-secondary p-4 dark:bg-dark-background-tertiary">
                    <h3 className="mb-1 text-sm font-medium text-text-secondary dark:text-dark-text-secondary">Session Time</h3>
                    <div className="text-2xl font-bold text-text-primary dark:text-dark-text-primary">
                      {formatSessionDuration(sessionStartTime)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Tab navigation - with dark mode styling */}
          {sessionActive && (
            <>
              <div className="border-b border-background-tertiary dark:border-dark-background-tertiary">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => handleTabChange('questions')}
                    className={`cursor-pointer border-b-2 py-2 px-1 text-sm font-medium ${
                      activeTab === 'questions'
                        ? 'border-primary text-primary dark:border-dark-primary dark:text-dark-primary'
                        : 'border-transparent text-text-secondary hover:border-background-tertiary hover:text-text-primary dark:text-dark-text-secondary dark:hover:border-dark-background-tertiary dark:hover:text-dark-text-primary'
                    }`}
                  >
                    Student Questions
                  </button>
                  <button
                    onClick={() => handleTabChange('points')}
                    className={`cursor-pointer border-b-2 py-2 px-1 text-sm font-medium ${
                      activeTab === 'points'
                        ? 'border-primary text-primary dark:border-dark-primary dark:text-dark-primary'
                        : 'border-transparent text-text-secondary hover:border-background-tertiary hover:text-text-primary dark:text-dark-text-secondary dark:hover:border-dark-background-tertiary dark:hover:text-dark-text-primary'
                    }`}
                  >
                    Ask Questions
                  </button>
                </nav>
              </div>
              
              {/* Active tab content */}
              {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
            </>
          )}
          
          {/* Loading state - with dark mode styling */}
          {isLoading && (
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
            </div>
          )}
          
          {/* Class name form if no class is set - with dark mode styling */}
          {!isLoading && !error && !className && (
            <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
              <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Create a Class</h2>
              <JoinClass 
                onSuccess={(className) => {
                  setClassName(className);
                  console.log('Class created:', className);
                }} 
                studentId={professorId}
              />
            </div>
          )}
        </div>
      </main>
      
      <footer className="border-t border-background-tertiary p-4 text-center text-sm text-text-secondary dark:border-dark-background-tertiary dark:text-dark-text-secondary">
        &copy; {new Date().getFullYear()} Classroom Q&A - Professor Dashboard
      </footer>
    </div>
  );
} 