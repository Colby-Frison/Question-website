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

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  clearPointsCache,
  deleteAnswer,
  cache
} from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { 
  createClassSession,
  endClassSession,
  updateSessionActivity,
  isSessionInactive,
  SESSION_INACTIVITY_TIMEOUT,
  forceIndexCreation,
  listenForStudentCount
} from '@/lib/classSession';
import { ClassSession, Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';
import JoinClass from '@/components/JoinClass';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

  // Add these state variables near the other state declarations
  const [newQuestionsCount, setNewQuestionsCount] = useState(0);
  const [newAnswersCount, setNewAnswersCount] = useState(0);
  const [lastSeenQuestionId, setLastSeenQuestionId] = useState<string | null>(null);
  const [lastSeenAnswerId, setLastSeenAnswerId] = useState<string | null>(null);

  // Add student count tracking
  const [studentCount, setStudentCount] = useState<number>(0);
  const [studentCountListener, setStudentCountListener] = useState<(() => void) | null>(null);

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
    
    let isComponentMounted = true;
    console.log("Setting up answers listener for question:", activeQuestionId);
    
    // Try to use cached data first
    const cachedData = cache.answers.get(activeQuestionId);
    if (cachedData && Date.now() - cachedData.timestamp < cache.CACHE_EXPIRATION) {
      console.log(`Using cached answers for question: ${activeQuestionId}`);
      setAnswers(cachedData.data);
    }
    
    const unsubscribe = listenForAnswers(activeQuestionId, (newAnswers) => {
      if (!isComponentMounted) return;
      console.log("Received answers update:", newAnswers);
      setAnswers(newAnswers);
    });
    
    // Clean up listener when component unmounts or activeQuestionId changes
    return () => {
      isComponentMounted = false;
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
    
    let isComponentMounted = true;
    
    // Try to use cached data first
    const cachedQuestion = cache.activeQuestions.get(activeQuestionId);
    if (cachedQuestion && Date.now() - cachedQuestion.timestamp < cache.CACHE_EXPIRATION) {
      console.log(`Using cached question text for: ${activeQuestionId}`);
      setActiveQuestionText(cachedQuestion.data.text || 'No text available');
      return;
    }
    
    // Retrieve the active question from Firestore
    const getActiveQuestionText = async () => {
      try {
        console.log(`Retrieving active question text for ID: ${activeQuestionId}`);
        const docRef = doc(db, ACTIVE_QUESTION_COLLECTION, activeQuestionId);
        const docSnap = await getDoc(docRef);
        
        if (!isComponentMounted) return;
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const text = data.text || 'No text available';
          setActiveQuestionText(text);
          console.log(`Retrieved active question text: ${text}`);
          
          // Cache the question text
          cache.activeQuestions.set(activeQuestionId, {
            data: { text },
            timestamp: Date.now()
          });
        } else {
          console.error(`Active question document ${activeQuestionId} not found`);
          setActiveQuestionText('Question not found');
        }
      } catch (error) {
        console.error(`Error retrieving active question ${activeQuestionId}:`, error);
        if (isComponentMounted) {
          setActiveQuestionText('Error loading question');
        }
      }
    };
    
    getActiveQuestionText();
    
    return () => {
      isComponentMounted = false;
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
      // Reset welcome message when starting a new session
      resetWelcomeMessage();
      
      setIsLoading(true);
      const result = await createClassSession(className, professorId);
      
      setSessionId(result.sessionId);
      setSessionCode(result.sessionCode);
      setSessionActive(true);
      setSessionStartTime(Date.now());
      setLastActivity(Date.now());
      
      // Start listening for questions with optimized listener
      const unsubscribe = listenForQuestions(result.sessionCode, (newQuestions) => {
        setQuestions(newQuestions);
      }, { 
        maxWaitTime: 5000, // 5 second debounce
        useCache: true // Enable caching
      });
      
      setIsLoading(false);
      
      // Return cleanup function
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
   * @param newStatus - The new status of the question
   */
  const handleToggleQuestionStatus = async (id: string, newStatus: 'answered' | 'unanswered') => {
    try {
      console.log(`Updating question ${id} status to ${newStatus}`);
      
      // The QuestionList component handles UI updates, so we just need to update the database
      const success = await updateQuestionStatus(id, newStatus);
      
      if (!success) {
        console.error(`Question ${id} status update failed`);
        throw new Error("Status update failed");
      }
      
      console.log(`Question ${id} status successfully updated to ${newStatus}`);
    } catch (error) {
      console.error("Error updating question status:", error);
      setError("Failed to update question status. Please try again.");
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
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
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'questions') {
      setNewQuestionsCount(0);
      if (questions.length > 0) {
        setLastSeenQuestionId(questions[0].id);
      }
    } else if (tab === 'points') {
      setNewAnswersCount(0);
      if (answers.length > 0) {
        setLastSeenAnswerId(answers[0].id);
      }
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
    
    // Format a number with comma separators for thousands
    const formatNumber = (num: number) => {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };
    
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
              aria-label={`Award ${formatNumber(points)} point${points !== 1 ? 's' : ''}`}
              title={currentPoints === points ? `Click to reset to 0 points` : `Award ${formatNumber(points)} point${points !== 1 ? 's' : ''}`}
            >
              {formatNumber(points)}
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
      
      // If clicking the same number, reset to 0 points
      if (previousPoints === points) {
        const pointsDifference = -previousPoints;
        
        // Update UI immediately for responsiveness
        setPointsAwarded(prev => {
          const newPointsAwarded = { ...prev };
          delete newPointsAwarded[answerId];
          return newPointsAwarded;
        });
        
        console.log(`Resetting points to 0 for student ${studentId} on answer ${answerId} (was ${previousPoints})`);
        
        // Only make the database call if there's an actual change
        if (pointsDifference !== 0) {
          // Apply the points change in the database
          const success = await updateStudentPoints(studentId, pointsDifference);
          
          if (!success) {
            // Revert UI if database update failed
      setPointsAwarded(prev => ({
        ...prev,
              [answerId]: previousPoints
            }));
            throw new Error("Failed to update points in the database");
          }
          
          // Update session activity only if the update succeeded
          if (sessionId) {
            await updateSessionActivity(sessionId);
            setLastActivity(Date.now());
          }
        }
        
        return;
      }
      
      // Handle assigning new points (different from current selection)
      // Calculate the actual point difference to apply
      const pointsDifference = points - previousPoints;
      
      // Update UI immediately for responsiveness
            setPointsAwarded(prev => ({
              ...prev,
        [answerId]: points
      }));
      
      console.log(`Changing points for student ${studentId} on answer ${answerId} from ${previousPoints} to ${points} (${pointsDifference > 0 ? '+' : ''}${pointsDifference})`);
      
      // Only make the database call if there's an actual change
      if (pointsDifference !== 0) {
        // Apply the points change in the database
        const success = await updateStudentPoints(studentId, pointsDifference);
        
        if (!success) {
          // Revert UI if database update failed
          setPointsAwarded(prev => {
            const newPointsAwarded = { ...prev };
            if (previousPoints === 0) {
              delete newPointsAwarded[answerId];
            } else {
              newPointsAwarded[answerId] = previousPoints;
            }
            return newPointsAwarded;
          });
          
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
          <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
          <svg className="mr-2 h-5 w-5 text-purple-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
              className="px-4 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition duration-200 dark:bg-dark-primary dark:hover:bg-dark-primary-hover dark:text-white font-medium"
            >
              Ask Question
            </button>
          </div>
          </form>
        
        {activeQuestionId ? (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2 flex items-center text-gray-900 dark:text-gray-100">
                <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
                <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
                        
                        <div className="flex items-center space-x-2">
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
                          
                          <button
                            onClick={() => handleDeleteAnswer(answer.id)}
                            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                            title="Delete answer"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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

  // Add this effect to track new questions
  useEffect(() => {
    if (!questions.length) return;
    
    const latestQuestion = questions[0];
    if (!lastSeenQuestionId) {
      setLastSeenQuestionId(latestQuestion.id);
      return;
    }
    
    if (latestQuestion.id !== lastSeenQuestionId) {
      setNewQuestionsCount(prev => prev + 1);
    }
  }, [questions, lastSeenQuestionId]);

  // Add this effect to track new answers
  useEffect(() => {
    if (!answers.length) return;
    
    const latestAnswer = answers[0];
    if (!lastSeenAnswerId) {
      setLastSeenAnswerId(latestAnswer.id);
      return;
    }
    
    if (latestAnswer.id !== lastSeenAnswerId) {
      setNewAnswersCount(prev => prev + 1);
    }
  }, [answers, lastSeenAnswerId]);

  // Add student count listener effect
  useEffect(() => {
    if (sessionCode) {
      const unsubscribe = listenForStudentCount(sessionCode, (count) => {
        setStudentCount(count);
      });
      setStudentCountListener(() => unsubscribe);
      return () => unsubscribe();
    }
  }, [sessionCode]);

  /**
   * Handle deleting a student answer
   * 
   * @param answerId - The ID of the answer to delete
   */
  const handleDeleteAnswer = async (answerId: string) => {
    try {
      console.log(`Deleting answer ${answerId}`);
      await deleteAnswer(answerId, 'professor'); // Using 'professor' as studentId since professors can delete any answer
      
      // Update the local state immediately to remove the deleted answer
      setAnswers(prevAnswers => prevAnswers.filter(a => a.id !== answerId));
      
      console.log(`Answer ${answerId} deleted successfully`);
    } catch (error) {
      console.error("Error deleting answer:", error);
      setError("Failed to delete answer. Please try again.");
    }
  };

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
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto dark:border-dark-primary"></div>
            <p className="mt-4 text-lg dark:text-gray-200">Loading...</p>
        </div>
      </div>
    </div>
  );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Sidebar */}
          <div className="w-full lg:w-1/3">
            <div className="bg-white dark:bg-gray-900 shadow-md rounded-lg p-6 sticky top-6 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
              {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg dark:bg-red-900/20 dark:text-red-300">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-gray-100">
                <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Class Management
              </h2>

              <div className="space-y-4">
                {/* Class Name Section */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <h3 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                    <svg className="mr-2 h-4 w-4 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Class Name
                  </h3>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="Enter class name"
                      className="flex-grow p-2 border rounded-md text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                <button
                      onClick={handleClassNameChange}
                      className="px-3 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors dark:bg-dark-primary dark:hover:bg-dark-primary-hover"
                    >
                      Update
                    </button>
                  </div>
                </div>

                {/* Session Management Section */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <h3 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                    <svg className="mr-2 h-4 w-4 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Class Session
                  </h3>
                  
                  {!sessionCode ? (
                    <button
                      onClick={handleStartSession}
                      disabled={isLoading}
                      className="w-full px-4 py-2 bg-blue-500 text-white rounded-md flex items-center justify-center space-x-2 hover:bg-blue-600 transition-colors dark:bg-dark-primary dark:hover:bg-dark-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      <span>{isLoading ? "Starting..." : "Start New Session"}</span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-gray-100 border border-gray-200 rounded-md text-center dark:bg-gray-700 dark:border-gray-600">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Session Code:</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{sessionCode}</p>
                      </div>
                      
                      <div className="text-sm text-gray-600 dark:text-gray-300 px-1">
                        <div className="flex items-center justify-between mb-1">
                          <span>Active students:</span>
                          <span className="font-medium">{studentCount}</span>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span>Session duration:</span>
                          <span className="font-medium">{formatSessionDuration(sessionStartTime)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Activity timeout:</span>
                          <span className="font-medium">{Math.floor(remainingMs() / 60000)} min</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleEndSession}
                        className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center space-x-2"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                        <span>End Session</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Tab Navigation */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <h3 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                    <svg className="mr-2 h-4 w-4 text-purple-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    Dashboard Views
                  </h3>
                  
                  <div className="flex border rounded-md overflow-hidden border-gray-300 dark:border-gray-600">
                    <button
                      onClick={() => handleTabChange('questions')}
                      className={`flex-1 py-2 text-center text-sm font-medium transition-colors relative ${
                    activeTab === 'questions'
                          ? 'bg-blue-500 text-white dark:bg-dark-primary'
                          : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Questions
                  {newQuestionsCount > 0 && activeTab !== 'questions' && (
                    <>
                      <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap">
                        {newQuestionsCount} new question{newQuestionsCount !== 1 ? 's' : ''}
                      </div>
                    </>
                  )}
                </button>
                <button
                      onClick={() => handleTabChange('points')}
                      className={`flex-1 py-2 text-center text-sm font-medium transition-colors relative ${
                    activeTab === 'points'
                          ? 'bg-blue-500 text-white dark:bg-dark-primary'
                          : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Points
                  {newAnswersCount > 0 && activeTab !== 'points' && (
                    <>
                      <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap">
                        {newAnswersCount} new answer{newAnswersCount !== 1 ? 's' : ''}
                      </div>
                    </>
                  )}
                </button>
              </div>
            </div>
        </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="w-full lg:w-2/3">
            {/* Welcome Message - Now inside the tab content with the same styling as other elements */}
            {activeTab === 'questions' && showWelcome ? (
              <div className="bg-white dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)] shadow-md rounded-lg p-6 mb-6 relative">
            <button 
                  onClick={handleCloseWelcome}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Close welcome message"
            >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
            </button>
                <h2 className="text-2xl font-bold mb-2 flex items-center text-gray-900 dark:text-gray-100">
                  <svg className="mr-2 h-6 w-6 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Welcome, Professor!
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {sessionCode 
                    ? `Share the session code "${sessionCode}" with your students to let them join this class.` 
                    : "Start a new session to begin collecting questions and awarding points to your students."}
                </p>
          </div>
            ) : null}
            {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
        </div>
        </div>
      </div>
    </div>
  );
} 