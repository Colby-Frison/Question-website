'use client';

/**
 * Student Dashboard Page
 * 
 * This component serves as the main dashboard for students, allowing them to:
 * - Join a class using a session code
 * - Ask questions to the professor
 * - View questions from other students
 * - Answer active questions from the professor
 * - Track and manage their points
 * 
 * The page handles real-time updates through Firebase listeners and
 * manages the student's class session and points.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JoinClass from '@/components/JoinClass';
import QuestionForm from '@/components/QuestionForm';
import QuestionList from '@/components/QuestionList';
import ClassQuestionList from '@/components/ClassQuestionList';
import { clearUserType, isStudent, getUserId } from '@/lib/auth';
import { 
  listenForUserQuestions, 
  listenForQuestions, 
  listenForActiveQuestion,
  addAnswer,
  listenForStudentPoints,
  updateStudentPoints,
  runDatabaseMaintenance,
  clearPointsCache,
  ACTIVE_QUESTION_COLLECTION,
  listenForAnswers,
  deleteAnswer,
  updateAnswer,
  deleteQuestion
} from '@/lib/questions';
import { 
  joinClass, 
  getJoinedClass, 
  leaveClass,
  updateStudentCount,
  listenForStudentCount
} from '@/lib/classCode';
import { getSessionByCode, listenForSessionStatus } from '@/lib/classSession';
import { Question, ClassSession } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';
import { checkFirebaseConnection } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Define tab types for the dashboard
type TabType = 'questions' | 'points';

// Define types for the component
interface ActiveQuestion {
  id: string;
  text: string;
  timestamp: number;
}

interface Answer {
  id: string;
  text: string;
  timestamp: number;
  studentId: string;
  questionText?: string;
  likes?: number;
  likedBy?: string[];
}

// Add new interface for points history
interface PointHistoryEntry {
  question: string;
  answer: string;
  points: number;
  timestamp: number;
  saved: boolean; // true if manually saved or points were awarded
}

// Add this to constant declarations near the top with other collection constants
const STUDENT_POINTS_COLLECTION = 'studentPoints';
const ANSWERS_COLLECTION = 'answers';
const DEBOUNCE_DELAY = 1000; // 1 second debounce delay

export default function StudentPage() {
  const router = useRouter();
  
  // Add initialization logging
  console.log("== STUDENT PAGE INITIALIZING ==");
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [sessionCode, setSessionCode] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'questions' | 'points'>('questions');
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const [initStage, setInitStage] = useState('starting');
  const [newQuestionsCount, setNewQuestionsCount] = useState(0);
  const [lastSeenQuestionId, setLastSeenQuestionId] = useState<string | null>(null);
  const [likedAnswers, setLikedAnswers] = useState<Set<string>>(new Set());
  
  // Add state to track welcome message visibility
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('hideWelcomeStudent');
      return savedState ? false : true; // Show by default unless explicitly hidden
    }
    return true;
  });
  
  // Points management state
  const [points, setPoints] = useState(0);
  const [pointsInput, setPointsInput] = useState<string>('0');
  const [isSavingPoints, setIsSavingPoints] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const pointsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Active question and answer state
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const lastQuestionCheckRef = useRef(Date.now());
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);
  const [sessionListener, setSessionListener] = useState<(() => void) | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const isFirstLoad = useRef(true);
  const [isLeavingClass, setIsLeavingClass] = useState(false);
  const [joinedClass, setJoinedClass] = useState<{className: string, sessionCode: string} | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('');
  const [studentPoints, setStudentPoints] = useState<number>(0);
  const [userQuestions, setUserQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [studentCountListener, setStudentCountListener] = useState<(() => void) | null>(null);
  const [showInactivityNotification, setShowInactivityNotification] = useState(false);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editAnswerText, setEditAnswerText] = useState('');
  const [deleteAnswerId, setDeleteAnswerId] = useState<string | null>(null);
  const [studentAnswer, setStudentAnswer] = useState<Answer | null>(null);
  const [showAnswerDeletedModal, setShowAnswerDeletedModal] = useState(false);
  const lastQuestionRef = useRef<Question | null>(null);
  const lastAnswerRef = useRef<Answer | null>(null);
  const previousAnswerRef = useRef<Answer | null>(null);
  const lastQuestionUpdateRef = useRef<number>(Date.now());
  const lastAnswerUpdateRef = useRef<number>(Date.now());

  // Points history state and functions
  const [pointsHistory, setPointsHistory] = useState<PointHistoryEntry[]>([]);

  // Load points history from localStorage on mount
  useEffect(() => {
    if (studentId) {
      const savedHistory = localStorage.getItem(`pointsHistory_${studentId}`);
      if (savedHistory) {
        setPointsHistory(JSON.parse(savedHistory));
      }
    }
  }, [studentId]);

  // Save points history to localStorage whenever it changes
  useEffect(() => {
    if (studentId && pointsHistory.length > 0) {
      localStorage.setItem(`pointsHistory_${studentId}`, JSON.stringify(pointsHistory));
    }
  }, [pointsHistory, studentId]);

  // Function to manually save an answer to history
  const handleSaveToHistory = () => {
    if (!activeQuestion || !studentAnswer) return;

    const newEntry: PointHistoryEntry = {
      question: activeQuestion.text,
      answer: studentAnswer.text,
      points: 0,
      timestamp: Date.now(),
      saved: true
    };

    setPointsHistory(prev => [newEntry, ...prev]);
  };

  // Function to update history when points are awarded
  const updateHistoryWithPoints = useCallback((answerId: string, points: number) => {
    if (!activeQuestion || !studentAnswer || studentAnswer.id !== answerId) return;

    // Check if this answer is already in history
    const existingEntryIndex = pointsHistory.findIndex(
      entry => entry.answer === studentAnswer.text && entry.question === activeQuestion.text
    );

    if (existingEntryIndex >= 0) {
      // Update existing entry
      const updatedHistory = [...pointsHistory];
      updatedHistory[existingEntryIndex] = {
        ...updatedHistory[existingEntryIndex],
        points,
        saved: true
      };
      setPointsHistory(updatedHistory);
    } else {
      // Add new entry
      const newEntry: PointHistoryEntry = {
        question: activeQuestion.text,
        answer: studentAnswer.text,
        points,
        timestamp: Date.now(),
        saved: true
      };
      setPointsHistory(prev => [newEntry, ...prev]);
    }
  }, [activeQuestion, studentAnswer, pointsHistory]);

  // Track points awarded in history
  useEffect(() => {
    if (!studentAnswer || !activeQuestion) return;

    const checkPointsAwarded = () => {
      // Check if points were awarded for this answer
      const pointsDoc = doc(db, STUDENT_POINTS_COLLECTION, studentId);
      getDoc(pointsDoc).then((doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.lastAwardedPoints && data.lastAwardedAnswerId === studentAnswer.id) {
            // Check if this answer is already in history
            const existingEntryIndex = pointsHistory.findIndex(
              entry => entry.answer === studentAnswer.text && entry.question === activeQuestion.text
            );

            if (existingEntryIndex >= 0) {
              // Update existing entry with new points
              setPointsHistory(prev => {
                const newHistory = [...prev];
                newHistory[existingEntryIndex] = {
                  ...newHistory[existingEntryIndex],
                  points: data.lastAwardedPoints,
                  saved: true
                };
                return newHistory;
              });
            } else {
              // Add new entry with awarded points
              const newEntry: PointHistoryEntry = {
                question: activeQuestion.text,
                answer: studentAnswer.text,
                points: data.lastAwardedPoints,
                timestamp: Date.now(),
                saved: true
              };
              setPointsHistory(prev => [newEntry, ...prev]);
            }

            // Update local points to match awarded points
            setPoints(data.lastAwardedPoints);
            setPointsInput(data.lastAwardedPoints.toString());
          }
        }
      });
    };

    // Check for points when answer is submitted
    checkPointsAwarded();

    // Set up interval to check periodically
    const interval = setInterval(checkPointsAwarded, 5000);

    return () => clearInterval(interval);
  }, [studentAnswer, activeQuestion, studentId, pointsHistory]);

  // Track new questions and update notification count
  useEffect(() => {
    if (questions.length > 0) {
      const latestQuestion = questions[questions.length - 1];
      if (latestQuestion.id !== lastSeenQuestionId) {
        setNewQuestionsCount(prev => prev + 1);
      }
    }
  }, [questions, lastSeenQuestionId]);

  // Reset notifications when switching to questions tab
  const handleTabChange = (tab: 'questions' | 'points') => {
    setActiveTab(tab);
    if (tab === 'questions') {
      setNewQuestionsCount(0);
      if (questions.length > 0) {
        setLastSeenQuestionId(questions[questions.length - 1].id);
      }
    }
  };

  // Define handleLeaveClass outside the component
  const handleLeaveClass = useCallback(() => {
    // Prevent multiple clicks
    if (isLeavingClass) return;
    
    console.log('Student leaving class');
    setIsLeavingClass(true);
    
    // Clean up Firebase data first
    if (studentId && sessionCode) {
      // Update student count before leaving
      updateStudentCount(sessionCode, false)
        .catch((error: Error) => {
          console.error("Error updating student count:", error);
        });

      leaveClass(studentId)
        .catch(error => {
          console.error("Error leaving class:", error);
        })
        .finally(() => {
          // Only update UI after Firebase cleanup completes
          // Update UI in a single batch to avoid race conditions
          setJoined(false);
          setClassName('');
          setSessionCode('');
          setQuestions([]);
          setActiveQuestion(null);
          setStudentCount(0);
          
          // Clean up listeners
          if (sessionListener) {
            sessionListener();
            setSessionListener(null);
          }
          if (studentCountListener) {
            studentCountListener();
            setStudentCountListener(null);
          }
          
          setIsLeavingClass(false);
        });
    } else {
      // If no studentId, just update UI
      setJoined(false);
      setClassName('');
      setSessionCode('');
      setQuestions([]);
      setActiveQuestion(null);
      setStudentCount(0);
      
      // Clean up listeners
      if (sessionListener) {
        sessionListener();
        setSessionListener(null);
      }
      if (studentCountListener) {
        studentCountListener();
        setStudentCountListener(null);
      }
      
      setIsLeavingClass(false);
    }
  }, [studentId, sessionCode, sessionListener, studentCountListener, isLeavingClass]);

  /**
   * Handle adding a point to student's total
   * Increments points by 1
   */
  const handleAddPoint = () => {
    // Trigger the points update with a 1-point increment
    handlePointsChange(points + 1);
  };

  /**
   * Handle subtracting a point from student's total
   * Decrements points by 1, but not below 0
   */
  const handleSubtractPoint = () => {
    // Trigger the points update with a 1-point decrement, but not below 0
    handlePointsChange(Math.max(0, points - 1));
  };

  /**
   * Handle setting points to a specific value
   * Validates input and updates points state
   */
  const handleSetPoints = () => {
    const newPoints = parseInt(pointsInput, 10);
    if (!isNaN(newPoints) && newPoints >= 0) {
      handlePointsChange(newPoints);
    } else {
      // Reset input to current points if invalid
      setPointsInput(points.toString());
    }
  };

  /**
   * Centralized function to handle all points changes and sync with database
   * @param newValue - The new points value to set
   */
  const handlePointsChange = (newValue: number) => {
    if (newValue === points) return; // No change, skip processing
    
    // Update UI immediately for responsiveness
    setPoints(newValue);
    setPointsInput(newValue.toString());
    
    // Sync with database if student is authenticated
      if (studentId) {
      // Indicate saving status
      setIsSavingPoints(true);
      
      // Clear any existing timeout to avoid multiple saves
        if (pointsSaveTimeoutRef.current) {
          clearTimeout(pointsSaveTimeoutRef.current);
        }
        
      // Debounce database update to avoid excessive writes
        pointsSaveTimeoutRef.current = setTimeout(async () => {
          try {
          console.log(`Syncing points to database: ${newValue}`);
          
            // Get current points from database
          let currentDbPoints = 0;
            
            // Use a promise to get the current points value
            await new Promise<void>((resolve) => {
              const unsubscribe = listenForStudentPoints(studentId, (dbPoints) => {
              currentDbPoints = dbPoints;
                unsubscribe();
                resolve();
              });
            });
            
          // Only update if there's a difference with what's in the database
          const pointsDifference = newValue - currentDbPoints;
            
            if (pointsDifference !== 0) {
            console.log(`Updating database with points difference: ${pointsDifference}`);
            const success = await updateStudentPoints(studentId, pointsDifference);
            
            if (success) {
              console.log(`Points saved to database. New total: ${newValue}`);
            } else {
              console.error("Failed to update points in database");
              // Don't revert UI here - let the listener handle any discrepancies
            }
          } else {
            console.log("Points already in sync with database");
            }
          } catch (error) {
            console.error("Error saving points to database:", error);
          } finally {
            setIsSavingPoints(false);
          }
      }, 1500); // Reduced from 2000ms to 1500ms for better responsiveness while still limiting calls
    }
  };

  /**
   * Effect to save points to localStorage when they change
   */
  useEffect(() => {
    // Save points to localStorage whenever they change
    if (typeof window !== 'undefined') {
      localStorage.setItem('studentPoints', points.toString());
    }
  }, [points]);

  /**
   * Set up real-time listener for student points from Firestore
   * Updates the points state when changes occur in the database
   */
  useEffect(() => {
    if (!studentId) return () => {};
    
    console.log("Setting up points listener for student:", studentId);
    let isInitialLoad = true;
    
    const unsubscribe = listenForStudentPoints(studentId, (newPoints) => {
      console.log("Received points update from database:", newPoints);
      
      // If it's the initial load or the points are different from local state
      if (isInitialLoad || newPoints !== points) {
        console.log(`Updating points from ${points} to ${newPoints} (initial load: ${isInitialLoad})`);
        
        // Update the local state
      setPoints(newPoints);
        setPointsInput(newPoints.toString());
        
        // Only show animation if it's not the initial load
        if (!isInitialLoad) {
          // Visual feedback for points change
          const pointsDisplay = document.getElementById('points-display');
          if (pointsDisplay) {
            // Add a temporary scale effect to highlight changes
            pointsDisplay.classList.add('scale-110');
            pointsDisplay.classList.add(newPoints > points ? 'text-green-500' : 'text-red-500');
            
            setTimeout(() => {
              pointsDisplay.classList.remove('scale-110');
              pointsDisplay.classList.remove(newPoints > points ? 'text-green-500' : 'text-red-500');
            }, 1000);
          }
        }
      }
      
      isInitialLoad = false;
    });
    
    return () => {
      console.log("Cleaning up points listener");
      unsubscribe();
    };
  }, [studentId]); // Remove points dependency to avoid constant re-subscriptions

  /**
   * Initial setup effect - runs once when component mounts
   * Checks if user is a student and gets their ID
   */
  useEffect(() => {
    console.log("== STUDENT PAGE MOUNT EFFECT STARTED ==");
    setInitStage('checking-user-type');
    
    // Check if user is a student
    if (!isStudent()) {
      console.log("Not a student, redirecting to home");
      router.push('/');
      setIsLoading(false);
      return;
    }

    setInitStage('getting-user-id');
    const userId = getUserId();
    console.log("User ID retrieved:", userId ? "success" : "failed");
    
    if (!userId) {
      console.log("No user ID found, redirecting to home");
      router.push('/');
      setIsLoading(false);
      return;
    }
    
    setStudentId(userId);
    setIsLoading(false);

    // Check network status
    const handleOnline = () => {
      console.log("Network connection restored");
      setNetworkStatus('online');
    };
    
    const handleOffline = () => {
      console.log("Network connection lost");
      setNetworkStatus('offline');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setInitStage('checking-firebase');
    // Verify Firebase connection on page load
    checkFirebaseConnection()
      .then(connected => {
        if (!connected) {
          console.error("Firebase connection failed. Check your Firebase configuration.");
          setError("Unable to connect to database. Please refresh or try again later.");
          setInitStage('firebase-connection-failed');
        } else {
          console.log("Firebase connection verified successfully.");
          setInitStage('firebase-connection-success');
        }
      })
      .catch(error => {
        console.error("Error checking Firebase connection:", error);
        setInitStage('firebase-connection-error');
      });
    
    console.log("== STUDENT PAGE MOUNT EFFECT COMPLETED ==");
    
    // Cleanup function
    return () => {
      // Clean up event listeners
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      // Clean up any pending timeouts
      if (pointsSaveTimeoutRef.current) {
        clearTimeout(pointsSaveTimeoutRef.current);
      }
      
      // Clear points cache for this student when the component unmounts
      if (userId) {
        clearPointsCache(userId);
      }
      
      console.log("== STUDENT PAGE CLEANUP COMPLETED ==");
    };
  }, [router]);

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
   * Effect to check if student has joined a class and set up listeners
   * for questions, class questions, and active questions
   */
  useEffect(() => {
    console.log("== JOINED CLASS EFFECT STARTED ==", {studentId, isLoading});
    
    if (!studentId) {
      console.log("No student ID available, skipping class check");
      setIsLoading(false);
      return;
    }
    
    let unsubscribers: (() => void)[] = [];
    let isComponentMounted = true;

    const checkJoinedClass = async () => {
      try {
        console.log("Checking for joined class...");
        const joinedClass = await getJoinedClass(studentId);
        
        if (!joinedClass || !isComponentMounted) {
          console.log("No joined class found or component unmounted");
          setIsLoading(false);
          return;
        }

        console.log("Found joined class:", joinedClass);
        setJoinedClass(joinedClass);
        setJoined(true);
        setClassName(joinedClass.className);
        setSessionCode(joinedClass.sessionCode);
        
        // Set up session status listener with enhanced error handling
        const unsubscribeSession = listenForSessionStatus(joinedClass.sessionCode, (status) => {
          if (!isComponentMounted) return;
          console.log("Session status update:", status);
          
          if (status === 'closed' || status === 'archived') {
            console.log(`Session ${joinedClass.sessionCode} has been ${status}`);
            // Clean up all listeners
            unsubscribers.forEach(unsubscribe => {
              try {
                unsubscribe();
              } catch (error) {
                console.error("Error during cleanup:", error);
              }
            });
            
            // Reset all state
            setJoined(false);
            setClassName('');
            setSessionCode('');
            setQuestions([]);
            setActiveQuestion(null);
            setStudentCount(0);
            setStudentAnswer(null);
            setAnswerText('');
            setAnswerSubmitted(false);
            setEditingAnswerId(null);
            setDeleteAnswerId(null);
            setShowAnswerDeletedModal(false);
            
            // Show appropriate notification
            if (status === 'closed') {
              setShowInactivityNotification(true);
            }
          }
          
          setSessionStatus(status || '');
        });
        unsubscribers.push(unsubscribeSession);

        // Set up active question listener with optimized settings
          setIsLoadingQuestion(true);
          const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass.sessionCode, (question) => {
          if (!isComponentMounted) return;
            console.log("Active question update received:", question ? "yes" : "no");
            
            if (question) {
              console.log(`Active question details - ID: ${question.id}`);
              
              // Check if this is a new question that we haven't seen before
              const isNewQuestion = !activeQuestion || activeQuestion.id !== question.id;
              
              // Update the active question state immediately
              setActiveQuestion(question);
              setIsLoadingQuestion(false);
              
              if (isNewQuestion) {
                console.log("New active question detected - clearing previous answer state");
                // Reset answer-related state for the new question
                setAnswerText('');
                setAnswerSubmitted(false);
                setStudentAnswer(null);
                previousAnswerRef.current = null;
                setEditingAnswerId(null);
                setDeleteAnswerId(null);
              }
            } else {
              // Only clear the question if we explicitly receive null (session ended)
              setActiveQuestion(null);
              setIsLoadingQuestion(false);
            }
            
            lastQuestionCheckRef.current = Date.now();
          }, { 
            maxWaitTime: DEBOUNCE_DELAY,
            useCache: true
          });
        unsubscribers.push(unsubscribeActiveQuestion);

        // Set up points listener
        const unsubscribePoints = listenForStudentPoints(studentId, (points) => {
          if (!isComponentMounted) return;
          console.log("Points update received:", points);
          setStudentPoints(points);
        });
        unsubscribers.push(unsubscribePoints);

        // Set up questions listener with optimized settings
        const unsubscribeQuestions = listenForQuestions(joinedClass.sessionCode, (questions) => {
          if (!isComponentMounted) return;
          console.log("Questions update received:", questions.length);
          setQuestions(questions);
        }, {
          maxWaitTime: DEBOUNCE_DELAY,
          useCache: true
        });
        unsubscribers.push(unsubscribeQuestions);

        // Set up user questions listener with optimized settings
        const unsubscribeUserQuestions = listenForUserQuestions(studentId, joinedClass.sessionCode, (userQuestions) => {
          if (!isComponentMounted) return;
          console.log("User questions update received:", userQuestions.length);
          setUserQuestions(userQuestions);
        }, {
          maxWaitTime: DEBOUNCE_DELAY,
          useCache: true
        });
        unsubscribers.push(unsubscribeUserQuestions);

        // Set up answers listener only when there's an active question
        if (activeQuestion) {
          const unsubscribeAnswers = listenForAnswers(activeQuestion.id, (answers) => {
            if (!isComponentMounted) return;
            console.log("Answers update received:", answers.length);
            setAnswers(answers);
          });
          unsubscribers.push(unsubscribeAnswers);
        }

        // Set up student count listener
        const unsubscribeStudentCount = listenForStudentCount(joinedClass.sessionCode, (count: number) => {
          setStudentCount(count);
        });
        unsubscribers.push(unsubscribeStudentCount);
        setStudentCountListener(unsubscribeStudentCount);

          setIsLoading(false);
      } catch (error) {
        console.error("Error in checkJoinedClass:", error);
        if (isComponentMounted) {
        setIsLoading(false);
          setError("Failed to initialize class. Please try again.");
        }
      }
    };

    checkJoinedClass();
    
    // Cleanup function
    return () => {
      isComponentMounted = false;
      unsubscribers.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Error during cleanup:", error);
        }
      });
    };
  }, [studentId, activeQuestion?.id]); // Remove isLoading from dependencies

  /**
   * Record user activity
   */
  const recordActivity = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  /**
   * Check if session has been inactive
   */
  useEffect(() => {
    // Setup activity listeners
    window.addEventListener('click', recordActivity);
    window.addEventListener('keypress', recordActivity);
    window.addEventListener('scroll', recordActivity);
    
    // Check for inactivity every minute
    const inactivityCheckInterval = setInterval(() => {
      const currentTime = Date.now();
      const inactivityThreshold = 30 * 60 * 1000; // 30 minutes
      
      if (currentTime - lastActivity > inactivityThreshold && sessionCode) {
        console.log('Session inactive for 30 minutes, checking session status...');
        
        // Check if the session is still active
        getSessionByCode(sessionCode)
          .then(session => {
            if (!session || session.status !== 'active') {
              console.log('Session is no longer active, leaving class...');
              handleLeaveClass();
              setShowInactivityNotification(true);
            } else {
              console.log('Session is still active');
            }
          })
          .catch(error => {
            console.error('Error checking session status:', error);
          });
      }
    }, 60000); // Check every minute
    
    return () => {
      window.removeEventListener('click', recordActivity);
      window.removeEventListener('keypress', recordActivity);
      window.removeEventListener('scroll', recordActivity);
      clearInterval(inactivityCheckInterval);
    };
  }, [lastActivity, sessionCode, handleLeaveClass, recordActivity]);

  /**
   * Handle closing the welcome message
   * Stores preference in localStorage to keep it closed between sessions
   */
  const handleCloseWelcome = useCallback(() => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideWelcomeStudent', 'true');
    }
  }, []);

  /**
   * Reset welcome message when joining a new class
   */
  const resetWelcomeMessage = useCallback(() => {
    setShowWelcome(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hideWelcomeStudent');
    }
  }, []);

  /**
   * Handle successful class join
   * Sets up state and listeners for the joined class
   * 
   * @param code - The session code of the joined class
   */
  const handleJoinClass = async (code: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check if session exists and is active
      const session = await getSessionByCode(code);
      if (!session) {
        setError("Invalid session code. Please check and try again.");
        setIsLoading(false);
        return;
      }
      
      if (session.status !== 'active') {
        setError("This session is no longer active.");
        setIsLoading(false);
        return;
      }
      
      // Join the class
      const success = await joinClass(code, studentId);
      if (!success) {
        setError("Failed to join class. Please try again.");
        setIsLoading(false);
        return;
      }

      // Update student count
      await updateStudentCount(code, true);
      
      // Set up listeners with optimized settings
      const unsubscribers: (() => void)[] = [];
      
      // Set up student count listener
      const unsubscribeStudentCount = listenForStudentCount(code, (count: number) => {
        setStudentCount(count);
      });
      unsubscribers.push(unsubscribeStudentCount);
      setStudentCountListener(unsubscribeStudentCount);
      
      // Set up personal questions listener with optimized settings
      const unsubscribePersonal = listenForUserQuestions(studentId, code, (questions) => {
        setUserQuestions(questions);
      }, {
        maxWaitTime: DEBOUNCE_DELAY,
        useCache: true
      });
      unsubscribers.push(unsubscribePersonal);
      
      // Set up class questions listener with optimized settings
      const unsubscribeClass = listenForQuestions(code, (questions) => {
        setQuestions(questions);
      }, {
        maxWaitTime: DEBOUNCE_DELAY,
        useCache: true
      });
      unsubscribers.push(unsubscribeClass);
      
      // Set up active question listener with optimized settings
      const unsubscribeActiveQuestion = listenForActiveQuestion(code, (question) => {
        setActiveQuestion(question);
        if (question) {
          setIsLoadingQuestion(false);
        }
      }, {
        maxWaitTime: DEBOUNCE_DELAY,
        useCache: true
      });
      unsubscribers.push(unsubscribeActiveQuestion);
      
      // Set up session status listener
      const unsubscribeSessionStatus = listenForSessionStatus(code, (status) => {
        setSessionStatus(status || '');
      });
      unsubscribers.push(unsubscribeSessionStatus);
      
      // Set up points listener
      const unsubscribePoints = listenForStudentPoints(studentId, (points) => {
        setStudentPoints(points);
      });
      unsubscribers.push(unsubscribePoints);
      
      // Update state
      setJoined(true);
      setSessionCode(code);
      setClassName(session.code);
      setJoinedClass({ className: session.code, sessionCode: code });
      
      // Clean up any existing listeners when component unmounts
      return () => {
        unsubscribers.forEach(unsubscribe => {
          try {
            unsubscribe();
          } catch (error) {
            console.error("Error during cleanup:", error);
          }
        });
      };
      
    } catch (error) {
      console.error("Error joining class:", error);
      setError("Failed to join class. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle user logout
   * Clears user type and redirects to home page
   */
  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

  /**
   * Handle input change for the points field
   * Validates input to ensure it's a positive number
   * 
   * @param e - The input change event
   */
  const handlePointsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow digits
    if (/^\d*$/.test(value)) {
      setPointsInput(value);
    }
  };

  /**
   * Handle editing an answer
   */
  const handleEditAnswer = (answer: Answer) => {
    setEditingAnswerId(answer.id);
    setEditAnswerText(answer.text);
  };

  /**
   * Handle saving an edited answer
   */
  const handleSaveEditAnswer = async () => {
    if (!editingAnswerId || !editAnswerText.trim() || !studentId) return;

    try {
      const success = await updateAnswer(editingAnswerId, editAnswerText.trim(), studentId);
      if (success) {
        // Update local state immediately
        const updatedAnswer = {
          ...studentAnswer!,
          text: editAnswerText.trim(),
          timestamp: Date.now()
        };
        setStudentAnswer(updatedAnswer);
        previousAnswerRef.current = updatedAnswer;
        setEditingAnswerId(null);
        setEditAnswerText('');
      } else {
        setError("Failed to update answer. Please try again.");
      }
    } catch (error) {
      console.error("Error updating answer:", error);
      setError("Failed to update answer. Please try again.");
    }
  };

  /**
   * Handle deleting an answer
   */
  const handleDeleteAnswer = async () => {
    if (!deleteAnswerId || !studentId) return;

    try {
      const success = await deleteAnswer(deleteAnswerId, studentId);
      if (success) {
        // Reset all answer-related state
        setStudentAnswer(null);
        setAnswerText('');
        setAnswerSubmitted(false);
        previousAnswerRef.current = null;
        setDeleteAnswerId(null); // Clear the deleteAnswerId immediately
      } else {
        setError("Failed to delete answer. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting answer:", error);
      setError("Failed to delete answer. Please try again.");
    }
  };

  // Update the answer submission handler to track the student's answer
  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeQuestion || !answerText.trim() || !studentId || !sessionCode) {
      return;
    }
    
    setIsSubmittingAnswer(true);
    
    try {
      const result = await addAnswer({
        text: answerText.trim(),
        activeQuestionId: activeQuestion.id,
        studentId,
        sessionCode,
        questionText: activeQuestion.text
      });
      
      if (result) {
        // Create a new answer object to update the state immediately
        const newAnswer = {
          id: result,
          text: answerText.trim(),
          timestamp: Date.now(),
          studentId,
          questionText: activeQuestion.text,
          activeQuestionId: activeQuestion.id
        };
        
        // Update all relevant state immediately
        setStudentAnswer(newAnswer);
        previousAnswerRef.current = newAnswer;
        setAnswerSubmitted(true);
        setAnswerText('');
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      setError("Failed to submit answer. Please try again.");
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Update the active question listener to track the student's answer with debouncing
  useEffect(() => {
    let unsubscribeAnswers: (() => void) | undefined;

    if (activeQuestion && studentId) {
      unsubscribeAnswers = listenForAnswers(activeQuestion.id, (answers) => {
        const studentAnswer = answers.find(a => a.studentId === studentId);
        const hadPreviousAnswer = previousAnswerRef.current !== null;
        
        if (!studentAnswer && hadPreviousAnswer) {
          console.log("Answer was deleted, resetting state");
          setShowAnswerDeletedModal(true);
          setAnswerText('');
          setAnswerSubmitted(false);
          setStudentAnswer(null);
          previousAnswerRef.current = null;
          setEditingAnswerId(null);
          setDeleteAnswerId(null);
        } else if (studentAnswer) {
          setStudentAnswer(studentAnswer);
          previousAnswerRef.current = studentAnswer;
          setAnswerSubmitted(true);
          
          if (editingAnswerId === studentAnswer.id && studentAnswer.text !== editAnswerText) {
            setEditAnswerText(studentAnswer.text);
          }
        }

        // Update liked answers
        const newLikedAnswers = new Set<string>();
        answers.forEach((answer: { id: string, likedBy?: string[] }) => {
          if (answer.likedBy?.includes(studentId)) {
            newLikedAnswers.add(answer.id);
          }
        });
        setLikedAnswers(newLikedAnswers);
      });
    }

    return () => {
      if (unsubscribeAnswers) {
        unsubscribeAnswers();
      }
    };
  }, [activeQuestion, studentId, editingAnswerId]);

  // Handle deleting a question from both lists
  const handleQuestionDelete = useCallback(async (questionId: string) => {
    try {
      const success = await deleteQuestion(questionId);
      if (success) {
        // Update both question lists
        setQuestions(prev => prev.filter(q => q.id !== questionId));
        setUserQuestions(prev => prev.filter(q => q.id !== questionId));
      } else {
        setError("Failed to delete question. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      setError("Failed to delete question. Please try again.");
    }
  }, []);
  
  // Handle status updates for both lists
  const handleQuestionStatusUpdate = useCallback((updatedQuestions: Question[]) => {
    // If we received an empty array or undefined, return early
    if (!updatedQuestions || updatedQuestions.length === 0) {
      console.log("[handleQuestionStatusUpdate] No questions to update");
      return;
    }
    
    console.log(`[handleQuestionStatusUpdate] Updating both lists with ${updatedQuestions.length} questions:`, 
      updatedQuestions.map(q => `${q.id}: ${q.status}`).join(', '));
    
    // Create a map of question IDs to their updated status
    const statusMap = new Map<string, 'answered' | 'unanswered'>();
    updatedQuestions.forEach(q => {
      if (q.id && q.status) {
        statusMap.set(q.id, q.status);
        console.log(`[handleQuestionStatusUpdate] Setting ${q.id} to ${q.status}`);
      }
    });
    
    if (statusMap.size === 0) {
      console.log("[handleQuestionStatusUpdate] No valid status updates found");
      return;
    }

    // Update Questions list with a functional update that logs before and after state
    setQuestions(prevQuestions => {
      console.log("[handleQuestionStatusUpdate] Questions BEFORE:", 
        prevQuestions.map(q => `${q.id}: ${q.status}`).join(', '));
      
      if (!prevQuestions || prevQuestions.length === 0) return prevQuestions;
      
      const updated = prevQuestions.map(q => {
        if (q.id && statusMap.has(q.id)) {
          console.log(`[handleQuestionStatusUpdate] Updating Question ${q.id} from ${q.status} to ${statusMap.get(q.id)!}`);
          return { ...q, status: statusMap.get(q.id)! };
        }
        return q;
      });
      
      console.log("[handleQuestionStatusUpdate] Questions AFTER:", 
        updated.map(q => `${q.id}: ${q.status}`).join(', '));
      
      return updated;
    });

    console.log(`[handleQuestionStatusUpdate] Status updates applied to both lists`);
  }, []);
  
  // Direct implementation of toggle status
  const handleToggleStatus = useCallback(async (questionId: string, newStatus: 'answered' | 'unanswered') => {
    console.log(`[Direct Toggle] Setting question ${questionId} to ${newStatus}`);
    
    // Call the handleQuestionStatusUpdate function with the updated question
    handleQuestionStatusUpdate([{ id: questionId, status: newStatus } as Question]);
    
    try {
      // Import the function at the top of the file
      const { updateQuestionStatus } = await import('@/lib/questions');
      
      // Update the database directly
      const success = await updateQuestionStatus(questionId, newStatus);
      
      if (!success) {
        console.error(`[Direct Toggle] Failed to update question status in database`);
        // Revert UI changes by calling handleQuestionStatusUpdate with reversed status
        handleQuestionStatusUpdate([{ id: questionId, status: newStatus === 'answered' ? 'unanswered' : 'answered' } as Question]);
      }
    } catch (error) {
      console.error(`[Direct Toggle] Error updating question status:`, error);
    }
  }, [handleQuestionStatusUpdate]);

  /**
   * Handle opening the modal for manual point entry
   */
  const handleOpenPointsModal = () => {
    setPointsInput(points.toString());
    setShowPointsModal(true);
  };
  
  /**
   * Handle closing the points modal
   */
  const handleClosePointsModal = () => {
    setShowPointsModal(false);
  };
  
  /**
   * Handle manual point entry from modal
   */
  const handleManualPointsEntry = () => {
    const newPoints = parseInt(pointsInput, 10);
    if (!isNaN(newPoints) && newPoints >= 0) {
      handlePointsChange(newPoints);
      setShowPointsModal(false);
    } else {
      // Reset input to current points if invalid
      setPointsInput(points.toString());
    }
  };

  /**
   * Render the questions tab content
   */
  const renderQuestionsTab = () => {
    return (
      <div className="grid grid-cols-1 gap-6">
        {/* Ask a Question Section */}
        <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg overflow-hidden dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center text-gray-900 dark:text-dark-text-primary">
              <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ask a Question
            </h2>
            <QuestionForm 
              studentId={studentId}
              sessionCode={sessionCode}
            />
          </div>
                </div>

        {/* Class Questions */}
        <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg overflow-hidden dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center text-gray-900 dark:text-dark-text-primary">
              <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Class Questions
            </h2>
            <QuestionList
              questions={questions}
              isProfessor={false}
              isStudent={true}
              studentId={studentId}
              showControls={false}
              emptyMessage="No questions have been asked yet."
              onDelete={handleQuestionDelete}
              onToggleStatus={handleToggleStatus}
              onStatusUpdated={handleQuestionStatusUpdate}
            />
              </div>
            </div>

        {/* My Questions */}
        <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg overflow-hidden dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center text-gray-900 dark:text-dark-text-primary">
              <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Questions
            </h2>
            <QuestionList
              questions={userQuestions}
              isProfessor={false}
              isStudent={true}
              studentId={studentId}
              showControls={true}
              emptyMessage="You haven't asked any questions yet."
              onDelete={handleQuestionDelete}
              onToggleStatus={handleToggleStatus}
              hideStatusIndicator={true}
            />
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => (
    <div>
      {/* Points Counter Card */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Your Points
        </h2>

        <div className="bg-blue-50/50 rounded-lg p-4 dark:bg-blue-900/10">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Points are awarded by your professor for participation and correct answers.
          </p>
        </div>

        <div className="mt-8 mb-8 relative">
          {/* Loading indicator */}
          {isSavingPoints && (
            <div className="absolute top-0 right-0 text-sm text-gray-500 dark:text-gray-400">
              Saving...
            </div>
          )}

          <div className="flex items-center justify-center space-x-6">
            {/* Minus button */}
            <button
              onClick={handleSubtractPoint}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors border-2 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-red-100 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>

            {/* Current Points */}
            <button
              onClick={handleOpenPointsModal}
              className="text-5xl font-bold text-blue-600 dark:text-blue-400 hover:opacity-75 transition-opacity cursor-pointer"
            >
              {points}
            </button>

            {/* Plus button */}
            <button
              onClick={handleAddPoint}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors border-2 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-green-100 hover:border-green-200 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:border-green-800 dark:hover:text-green-400"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <p className="text-center mt-4 text-gray-600 dark:text-gray-400">
            Total points earned in this class
          </p>

          <button
            onClick={handleOpenPointsModal}
            className="text-center w-full mt-2 text-blue-600 dark:text-blue-400"
          >
            Edit Points
          </button>
        </div>
      </div>

      {/* Points Modal with Keypad */}
      {showPointsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Edit Points
            </h3>

            {/* Points Display and Manual Input */}
            <div className="mb-4">
              <input
                type="text"
                value={pointsInput}
                onChange={handlePointsInputChange}
                className="w-full p-3 text-right text-2xl font-bold bg-gray-50 border rounded-lg dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
                readOnly
              />
            </div>

            {/* Number Keypad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === 'C') {
                      setPointsInput('0');
                    } else if (key === '⌫') {
                      setPointsInput(prev => prev.slice(0, -1) || '0');
                    } else {
                      setPointsInput(prev => (prev === '0' ? key.toString() : prev + key));
                    }
                  }}
                  className="p-4 text-xl font-semibold rounded-lg transition-colors
                    ${typeof key === 'number' 
                      ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600' 
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500'}
                    text-gray-800 dark:text-gray-100"
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleClosePointsModal}
                className="px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleManualPointsEntry}
                className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Set Points
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Question Card */}
      <div className="bg-white shadow-md rounded-lg p-6 dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-gray-100">
          <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Current Question
        </h2>
        
        {activeQuestion ? (
          <div>
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <p className="font-medium text-blue-900 dark:text-blue-100">{activeQuestion.text}</p>
            </div>
            
            {studentAnswer ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200 dark:bg-green-900/20 dark:border-green-800">
                  <div className="flex justify-between items-start">
                    <div className="flex-grow">
                      {editingAnswerId === studentAnswer.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editAnswerText}
                            onChange={(e) => setEditAnswerText(e.target.value)}
                            className="w-full p-2 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md dark:bg-dark-background-tertiary focus:border-blue-500 dark:focus:border-dark-primary focus:outline-none"
                            rows={3}
                            placeholder="Edit your answer..."
                          />
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => {
                                setEditingAnswerId(null);
                                setEditAnswerText('');
                              }}
                              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-white rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEditAnswer}
                              className="px-3 py-1 text-sm bg-blue-500 text-white dark:bg-dark-primary rounded-md hover:bg-blue-600 dark:hover:bg-dark-primary-hover transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-900 dark:text-gray-100">{studentAnswer.text}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={handleSaveToHistory}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                        title="Save to history"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEditAnswer(studentAnswer)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                        title="Edit answer"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteAnswerId(studentAnswer.id)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                        title="Delete answer"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAnswerSubmit} className="space-y-4">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmittingAnswer}
                  className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors dark:bg-dark-primary dark:hover:bg-dark-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingAnswer ? 'Submitting...' : 'Submit Answer'}
                </button>
              </form>
            )}

            {/* Display all student answers */}
            {answers.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-900 dark:text-gray-100">
                  <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                  Class Answers
                </h3>
                <div className="space-y-4">
                  {answers.map((answer) => (
                    <div 
                      key={answer.id} 
                      className={`p-4 rounded-lg border ${
                        answer.studentId === studentId 
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                          : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                      }`}
                    >
                      <p className="text-gray-900 dark:text-gray-100">{answer.text}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {answer.studentId === studentId ? 'Your answer' : 'Classmate\'s answer'}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center">
                              <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {new Date(answer.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleLikeAnswer(answer.id)}
                          className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors ${
                            likedAnswers.has(answer.id)
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                          }`}
                        >
                          <svg 
                            className="w-4 h-4" 
                            fill={likedAnswers.has(answer.id) ? "currentColor" : "none"} 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                            />
                          </svg>
                          <span className="text-sm">{answer.likes || 0}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 dark:text-gray-300 mb-1">No active question</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Wait for your professor to ask a question.</p>
        </div>
      )}
    </div>

    {/* Points History Section */}
    <div className="bg-white shadow-md rounded-lg p-6 dark:bg-gray-900 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
      <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-gray-100">
        <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      Points History
    </h2>

    {pointsHistory.length > 0 ? (
      <div className="space-y-4">
        {pointsHistory.map((entry, index) => (
          <div key={index} className="p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="mb-2">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Question:</h3>
              <p className="text-gray-700 dark:text-gray-300">{entry.question}</p>
            </div>
            <div className="mb-2">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Your Answer:</h3>
              <p className="text-gray-700 dark:text-gray-300">{entry.answer}</p>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-4">
                <span className="text-sm bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full text-blue-800 dark:text-blue-300">
                  {entry.points} points
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {entry.saved && (
                  <span className="text-sm text-green-600 dark:text-green-400 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                )}
                <button
                  onClick={() => handleRemoveFromHistory(index)}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                  title="Remove from history"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg dark:border-gray-700">
        <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-600 dark:text-gray-300 mb-1">No points history yet</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Your answered questions and earned points will appear here.</p>
      </div>
    )}
  </div>
</div>
);

  /**
   * Function to manually refresh student points from the database
   */
  const refreshStudentPoints = async () => {
    if (!studentId) {
      console.log("Cannot refresh points: no student ID available");
      return;
    }

    try {
      setIsLoading(true);
      console.log(`Manually refreshing points for student: ${studentId}`);
      
      // Clear cache first to ensure we get fresh data
      clearPointsCache(studentId);
      
      // Get the points data from Firestore
      const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
      const pointsDoc = await getDoc(pointsRef);
      
      if (pointsDoc.exists()) {
        const pointsData = pointsDoc.data();
        console.log(`Retrieved points data:`, pointsData);
        setPoints(pointsData.total || 0);
        setPointsInput((pointsData.total || 0).toString());
      } else {
        console.log(`No points record found for student: ${studentId}, initializing with 0`);
        // Initialize with 0 points if no record exists
        await setDoc(pointsRef, { 
          total: 0,
          lastUpdated: Date.now() 
        });
        setPoints(0);
        setPointsInput('0');
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error refreshing student points:", error);
      setError("Failed to refresh points data. Please try again.");
      setIsLoading(false);
    }
  };

  const handleLikeAnswer = async (answerId: string) => {
    if (!studentId || !answerId) return;

    try {
      const answerRef = doc(db, ANSWERS_COLLECTION, answerId);
      const answerDoc = await getDoc(answerRef);
      
      if (!answerDoc.exists()) return;
      
      const data = answerDoc.data();
      const currentLikes = data.likes || 0;
      const likedBy = data.likedBy || [];
      const isLiked = likedBy.includes(studentId);
      
      if (isLiked) {
        // Unlike
        await updateDoc(answerRef, {
          likes: currentLikes - 1,
          likedBy: arrayRemove(studentId)
        });
        setLikedAnswers((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete(answerId);
          return newSet;
        });
      } else {
        // Like
        await updateDoc(answerRef, {
          likes: currentLikes + 1,
          likedBy: arrayUnion(studentId)
        });
        setLikedAnswers((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add(answerId);
          return newSet;
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  // Function to remove an entry from points history
  const handleRemoveFromHistory = (index: number) => {
    setPointsHistory(prev => {
      const newHistory = [...prev];
      newHistory.splice(index, 1);
      return newHistory;
    });
  };

  // Show network error if offline
  if (networkStatus === 'offline') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-dark-background flex flex-col">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Network Error</h2>
            <p className="mb-4 text-gray-700 dark:text-dark-text-secondary">You are currently offline. Please check your internet connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-dark-primary dark:hover:bg-dark-primary-hover dark:text-dark-text-inverted transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if there's a problem
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-dark-background flex flex-col">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Error</h2>
            <p className="mb-4 text-gray-700 dark:text-dark-text-secondary">{error}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setError(null)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-dark-primary dark:hover:bg-dark-primary-hover dark:text-dark-text-inverted transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 dark:text-dark-text-inverted transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
  return (
      <div className="min-h-screen bg-gray-100 dark:bg-dark-background flex flex-col">
      <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex justify-center items-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-dark-primary mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600 dark:text-dark-text-secondary">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-dark-background flex flex-col">
      <Navbar userType="student" onLogout={handleLogout} />

      {/* Inactivity Notification */}
      {showInactivityNotification && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-background-secondary rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-500 dark:text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-2">
                Session Ended
              </h3>
              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                You have been removed from the class due to inactivity.
              </p>
              <button
                onClick={() => setShowInactivityNotification(false)}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors dark:bg-dark-primary dark:hover:bg-dark-primary-hover"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        {!joined ? (
          <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
            <div className="max-w-sm w-full mx-auto">
              <div className="bg-white shadow-md rounded-lg overflow-hidden dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                <div className="p-8">
                  <h2 className="text-xl font-bold mb-6 text-center text-gray-900 dark:text-dark-text-primary">Join a Class</h2>
                  
                  <div className="group relative mb-4">
                    <div className="flex items-center mb-1 justify-center">
                      <label htmlFor="infoSessionCode" className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                        Session Code
                      </label>
                      <div className="relative ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute top-0 left-full transform -translate-y-1/2 mt-1 ml-1 w-60 p-2 bg-gray-800 text-xs text-white rounded-md shadow-lg z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          Enter the 6-digit code provided by your professor
                        </div>
                        <svg className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <JoinClass studentId={studentId} onSuccess={handleJoinClass} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Sidebar */}
            <div className="w-full lg:w-1/3">
              <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg p-6 sticky top-6 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                {error && (
                  <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg dark:bg-red-900/20 dark:text-red-300 dark:border dark:border-red-800">
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-dark-text-primary">
                  <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Class Information
                </h2>

                <div className="space-y-4">
                  {/* Session Information Section */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-dark-background-tertiary dark:border-gray-700">
                    <h3 className="font-medium mb-2 flex items-center text-gray-900 dark:text-dark-text-primary">
                      <svg className="mr-2 h-4 w-4 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Session Details
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center dark:bg-blue-900/10 dark:border-blue-900 dark:text-dark-text-primary">
                        <p className="font-medium text-gray-700 dark:text-dark-text-secondary">Class:</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-dark-primary">{className}</p>
                      </div>
                      
                      <div className="p-3 bg-gray-100 border border-gray-200 rounded-md text-center dark:bg-dark-background-tertiary dark:border-gray-700">
                        <p className="font-medium text-gray-700 dark:text-dark-text-secondary">Session Code:</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-dark-primary font-mono tracking-wider bg-white dark:bg-gray-800 px-4 py-2 rounded-md shadow-sm">
                          {sessionCode}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Leave Class Button */}
                  <div className="mt-4">
                    <button
                      onClick={handleLeaveClass}
                      disabled={isLeavingClass}
                      className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLeavingClass ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Leaving...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span>Leave Class</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  {/* Tab Navigation */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-dark-background-tertiary dark:border-gray-700">
                    <h3 className="font-medium mb-2 flex items-center text-gray-900 dark:text-dark-text-primary">
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
                            ? 'bg-blue-500 text-white dark:bg-dark-primary dark:text-dark-text-inverted'
                            : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-quaternary'
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
                        className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                          activeTab === 'points'
                            ? 'bg-blue-500 text-white dark:bg-dark-primary dark:text-dark-text-inverted'
                            : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-quaternary'
                        }`}
                      >
                        My Points
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Main Content Area */}
            <div className="w-full lg:w-2/3">
              {/* Welcome Message */}
              {showWelcome && (
                <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg p-6 mb-6 relative dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                  <button 
                    onClick={handleCloseWelcome}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary"
                    aria-label="Close welcome message"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <h2 className="text-2xl font-bold mb-2 flex items-center text-gray-900 dark:text-dark-text-primary">
                    <svg className="mr-2 h-6 w-6 text-blue-500 dark:text-dark-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Welcome, Student!
                  </h2>
                  <p className="text-gray-600 dark:text-dark-text-secondary">
                    You've joined the class session with code <span className="font-mono tracking-wider bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">{sessionCode}</span>. Ask questions and participate in class activities to earn points.
                  </p>
                </div>
              )}
              
              {/* Tabs Content */}
              <div className="mb-6">
                {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Answer Confirmation Modal */}
      {deleteAnswerId && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-background-secondary rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-500 dark:text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-2">
                Delete Answer
              </h3>
              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                Are you sure you want to delete your answer? This action cannot be undone.
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setDeleteAnswerId(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors dark:bg-dark-background dark:text-dark-text-primary dark:hover:bg-dark-background-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAnswer}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add the answer deleted notification modal */}
      {showAnswerDeletedModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-background-secondary rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-yellow-500 dark:text-yellow-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-2">
                Answer Deleted
              </h3>
              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                Your answer has been deleted by the professor. You can submit a new answer below.
              </p>
              <button
                onClick={() => setShowAnswerDeletedModal(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 