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
  listenForAnswers
} from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { getSessionByCode, listenForSessionStatus } from '@/lib/classSession';
import { Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';
import { checkFirebaseConnection } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
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
}

// Add this to constant declarations near the top with other collection constants
const STUDENT_POINTS_COLLECTION = 'studentPoints';

export default function StudentPage() {
  const router = useRouter();
  
  // Add initialization logging
  console.log("== STUDENT PAGE INITIALIZING ==");
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const [initStage, setInitStage] = useState('starting');
  const [newQuestionsCount, setNewQuestionsCount] = useState<number>(0);
  const [lastSeenQuestionId, setLastSeenQuestionId] = useState<string | null>(null);
  
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
  const [points, setPoints] = useState<number>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const savedPoints = localStorage.getItem('studentPoints');
      return savedPoints ? parseInt(savedPoints, 10) : 0;
    }
    return 0;
  });
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

  // Add this function to reset notifications when switching tabs
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'questions') {
      setNewQuestionsCount(0);
      if (questions.length > 0) {
        setLastSeenQuestionId(questions[0].id);
      }
    }
  };

  // Add this effect to track new questions
  useEffect(() => {
    if (!questions.length) return;
    
    const latestQuestion = questions[0];
    if (!lastSeenQuestionId) {
      setLastSeenQuestionId(latestQuestion.id);
      return;
    }
    
    if (latestQuestion.id !== lastSeenQuestionId) {
      setNewQuestionsCount((prev: number) => prev + 1);
    }
  }, [questions, lastSeenQuestionId]);

  // Define handleLeaveClass outside the component
  const handleLeaveClass = useCallback(() => {
    // Prevent multiple clicks
    if (isLeavingClass) return;
    
    console.log('Student leaving class');
    setIsLeavingClass(true);
    
    // Clean up Firebase data first
    if (studentId) {
      leaveClass(studentId)
        .catch(error => {
          console.error("Error leaving class:", error);
          // Consider showing an error to the user here
        })
        .finally(() => {
          // Only update UI after Firebase cleanup completes
          // Update UI in a single batch to avoid race conditions
          setJoined(false);
          setClassName('');
          setSessionCode('');
          setQuestions([]);
          setActiveQuestion(null);
          
          // Clean up listeners
          if (sessionListener) {
            sessionListener();
            setSessionListener(null);
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
      
      // Clean up listeners
      if (sessionListener) {
        sessionListener();
        setSessionListener(null);
      }
      
      setIsLeavingClass(false);
    }
  }, [studentId, sessionListener, isLeavingClass, setJoined, setClassName, setSessionCode, 
      setQuestions, setActiveQuestion, setIsLeavingClass, setSessionListener]);

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
      return;
    }

    setInitStage('getting-user-id');
    const userId = getUserId();
    console.log("User ID retrieved:", userId ? "success" : "failed");
    setStudentId(userId);

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
    
    if (!studentId || isLoading) {
      return;
    }

    let unsubscribers: (() => void)[] = [];
    let isComponentMounted = true;

    const checkJoinedClass = async () => {
      try {
        const joinedClass = await getJoinedClass(studentId);
        
        if (!joinedClass || !isComponentMounted) {
          console.log("No joined class found or component unmounted");
          setIsLoading(false);
          return;
        }

        console.log("Found joined class:", joinedClass);
        setJoinedClass(joinedClass);
        
        // Set up session status listener
        const unsubscribeSession = listenForSessionStatus(joinedClass.sessionCode, (status) => {
          if (!isComponentMounted) return;
          console.log("Session status update:", status);
          setSessionStatus(status || '');
        });
        unsubscribers.push(unsubscribeSession);

        // Set up active question listener with optimized settings
        setIsLoadingQuestion(true);
        const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass.sessionCode, (question) => {
          if (!isComponentMounted) return;
          console.log("Active question update received:", question ? "yes" : "no");
          
          if (question) {
            console.log(`Active question details - ID: ${question.id}, Text: ${question.text.substring(0, 30)}...`);
            
            // Check if this is a new question that we haven't seen before
            const isNewQuestion = !activeQuestion || activeQuestion.id !== question.id;
            
            if (isNewQuestion) {
              console.log("New active question detected!");
              
              // Reset answer state for the new question
              setAnswerText('');
              setAnswerSubmitted(false);
            }
          }
          
          // Mark as no longer first load after first update
          isFirstLoad.current = false;
          
          // Update the state
          setActiveQuestion(question);
          setIsLoadingQuestion(false);
          lastQuestionCheckRef.current = Date.now();
        }, { 
          maxWaitTime: 10000, // Set higher debounce time (10 seconds) to reduce server calls
          useCache: true // Enable caching to reduce server calls
        });
        unsubscribers.push(unsubscribeActiveQuestion);

        // Set up points listener with optimized settings
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
          maxWaitTime: 5000, // 5 second debounce for questions
          useCache: true
        });
        unsubscribers.push(unsubscribeQuestions);

        // Set up user questions listener with optimized settings
        const unsubscribeUserQuestions = listenForUserQuestions(studentId, joinedClass.sessionCode, (userQuestions) => {
          if (!isComponentMounted) return;
          console.log("User questions update received:", userQuestions.length);
          setUserQuestions(userQuestions);
        }, {
          maxWaitTime: 5000, // 5 second debounce for user questions
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
  }, [studentId, isLoading, activeQuestion?.id]);

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
              // Use alert instead of toast since we don't have a toast component
              alert('Session ended: You have been removed from the class due to inactivity.');
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
  const handleJoinSuccess = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      console.log(`Attempting to join class with session code: ${code}`);
      
      // Reset welcome message when joining a new class
      resetWelcomeMessage();
      
      // Verify the session code is valid
      const session = await getSessionByCode(code);
      
      if (!session) {
        console.error(`Invalid session code: ${code}. Session not found.`);
        setError("Invalid session code. The class may have ended or doesn't exist.");
        setIsLoading(false);
        return;
      }
      
      console.log(`Found valid session:`, session);
      
      // Set class and session info
      setClassName(session.code); // Original class name
      setSessionCode(code);       // Session code
        setJoined(true);
        
      console.log(`Setting up question listeners for student ${studentId} in session ${code}`);
      
      // Set up listener for student's questions with real-time updates
      console.log("Setting up personal questions listener with real-time updates...");
      const unsubscribePersonal = listenForUserQuestions(studentId, code, (questions) => {
        console.log(`Received ${questions.length} personal questions`);
        // Use functional update to ensure we're working with latest state
        setQuestions(currentQuestions => {
          // Deep comparison to avoid unnecessary re-renders
          if (JSON.stringify(currentQuestions) === JSON.stringify(questions)) {
            console.log("No changes in personal questions, skipping update");
            return currentQuestions;
          }
          console.log("Updating personal questions with:", questions);
          return questions;
        });
        setIsLoading(false);
      }, { maxWaitTime: 0 }); // Immediate updates
      
      // Set up listener for all class questions
      console.log("Setting up class questions listener...");
      const unsubscribeClass = listenForQuestions(code, (questions) => {
        console.log(`Received ${questions.length} class questions`);
          setQuestions(questions);
      });
        
      // Set up listener for active question - refresh every 5 seconds
      console.log(`Setting up active question listener...`);
        setIsLoadingQuestion(true);
      const unsubscribeActiveQuestion = listenForActiveQuestion(code, (question) => {
          console.log("Active question update:", question);
        
        // If the active question changes, reset the answer state
        if (question?.id !== activeQuestion?.id) {
          setAnswerText('');
          setAnswerSubmitted(false);
        }
        
        setActiveQuestion(question);
          setIsLoadingQuestion(false);
          lastQuestionCheckRef.current = Date.now();
      }, { maxWaitTime: 5000 });
      
      // Set up listener for session status changes
      console.log(`Setting up session status listener...`);
      const unsubscribeSessionStatus = listenForSessionStatus(code, (status) => {
        console.log(`Session status changed to: ${status}`);
        
        // If the session is closed or archived, leave the class
        if (!status || status === 'closed' || status === 'archived') {
          console.log('Session ended by professor, leaving class...');
          // Call handleLeaveClass directly
      setJoined(false);
          setClassName('');
          setSessionCode('');
      setQuestions([]);
        setActiveQuestion(null);
          
          if (studentId) {
            leaveClass(studentId).catch(console.error);
          }
          
          if (sessionListener) {
            sessionListener();
            setSessionListener(null);
          }
          
          alert('Class ended: The professor has ended this class session.');
        }
      });
      
      setSessionListener(() => unsubscribeSessionStatus);
      setIsLoading(false);
      console.log(`Join successful. All listeners set up.`);
      
      // Return cleanup function
      return () => {
        console.log('Cleaning up question listeners');
        unsubscribePersonal();
        unsubscribeClass();
        unsubscribeActiveQuestion();
        unsubscribeSessionStatus();
      };
    } catch (error) {
      console.error('Error joining class:', error);
      setError('Failed to join class. Please try again.');
      setIsLoading(false);
    }
  }, [studentId, activeQuestion]); // Remove handleLeaveClass dependency

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
   * Handle submitting an answer to an active question
   */
  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeQuestion || !answerText.trim() || !studentId || !sessionCode) {
      return;
    }
    
    setIsSubmittingAnswer(true);
    
    try {
      const result = await addAnswer({
        text: answerText,
        activeQuestionId: activeQuestion.id,
        studentId,
        sessionCode,
        questionText: activeQuestion.text
      });
      
      if (result) {
        setAnswerSubmitted(true);
        setAnswerText('');
        
        // Start cooldown timer
        setCooldownActive(true);
        setCooldownTime(10);
        
        const timer = setInterval(() => {
          setCooldownTime(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              setCooldownActive(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Handle deleting a question from both lists
  const handleQuestionDelete = useCallback((questionId: string) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId));
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
  const renderPointsTab = () => {
    return (
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg p-6 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <h3 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-white">
            <svg className="mr-2 h-5 w-5 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Your Points
          </h3>
          
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-6 dark:bg-blue-900/10 dark:border-blue-800 dark:text-white">
            <p className="text-sm text-blue-800 dark:text-white">
              Points are awarded by your professor for participation and correct answers.
            </p>
              </div>
          
          <div className="bg-white dark:bg-dark-background-tertiary shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center mb-6 relative">
            {isSavingPoints && (
              <div className="absolute top-2 right-2 text-xs text-blue-600 dark:text-dark-text-tertiary flex items-center">
                <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
            </div>
            )}
            
            <h4 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">Current Points</h4>
            <div className="flex justify-center items-center mb-4">
              <button
                onClick={handleSubtractPoint}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-dark-red-400 transition-colors mr-4"
                title="Subtract 1 point"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              
              <div 
                id="points-display" 
                className="text-5xl font-bold text-blue-600 dark:text-dark-primary transition-all transform cursor-pointer"
                onClick={handleOpenPointsModal}
                title="Click to edit points"
              >
                {points}
        </div>
              
              <button
                onClick={handleAddPoint}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 hover:bg-green-100 hover:text-green-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-green-900/30 dark:hover:text-green-400 transition-colors ml-4"
                title="Add 1 point"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                </svg>
              </button>
      </div>
            
            <div className="text-sm text-blue-800 dark:text-white text-center mb-2">
              Total points earned in this class
    </div>
            
            <button
              onClick={handleOpenPointsModal}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-dark-primary transition-colors"
            >
              Edit Points
            </button>
          </div>
            </div>
        
        {/* Points Modal */}
        {showPointsModal && (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-dark-background-secondary rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-5">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Edit Points</h3>
                
                <div className="mb-4">
                  <input
                    type="text"
                    value={pointsInput}
                    onChange={handlePointsInputChange}
                    className="w-full text-center p-3 text-2xl font-bold border rounded-md dark:bg-dark-background-tertiary dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-dark-primary"
                    aria-label="Set points value"
                    autoFocus
                  />
          </div>
                
                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                    <button
                      key={num}
                      onClick={() => setPointsInput(prev => num === 0 && prev === '0' ? '0' : prev === '0' ? num.toString() : prev + num.toString())}
                      className="p-3 text-xl bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-dark-background-tertiary dark:hover:bg-dark-background-quaternary dark:text-white"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => setPointsInput('0')}
                    className="p-3 text-xl bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-dark-background-tertiary dark:hover:bg-dark-background-quaternary dark:text-white"
                  >
                    Clear
                  </button>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleClosePointsModal}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-dark-background-tertiary dark:text-white dark:hover:bg-dark-background-quaternary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManualPointsEntry}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 dark:bg-dark-primary dark:hover:bg-dark-primary-hover"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white dark:bg-dark-background-secondary shadow-md rounded-lg p-6 dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <h3 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-white">
            <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Answer Professor's Question
          </h3>
          
          {activeQuestion ? (
            <div>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800 dark:text-white">
                <h3 className="font-semibold mb-2">Current Question:</h3>
                <p className="font-medium">{activeQuestion.text}</p>
            </div>
            
            {answerSubmitted ? (
                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800 dark:text-white">
                  <p className="font-semibold">Your answer has been submitted!</p>
                  <p className="mt-2 text-sm">The professor will review your answer and may award points.</p>
              </div>
            ) : (
                <form onSubmit={handleAnswerSubmit} className="mt-4">
                <div className="mb-4">
                    <label htmlFor="pointsTabAnswerText" className="block mb-2 font-semibold text-gray-900 dark:text-dark-text-primary">
                      Your Answer:
                  </label>
                  <textarea
                      id="pointsTabAnswerText"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                      className="w-full p-3 border rounded-lg dark:bg-dark-background-tertiary dark:text-dark-text-primary dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-dark-primary focus:border-transparent transition duration-200"
                      rows={4}
                      disabled={cooldownActive}
                    required
                      placeholder="Type your answer here..."
                  />
                </div>
                <button
                  type="submit"
                    className={`w-full px-4 py-3 rounded-lg font-medium transition duration-200 ${
                      cooldownActive || isSubmittingAnswer
                        ? 'bg-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-blue-500 hover:bg-blue-600 text-white dark:bg-dark-primary dark:hover:bg-dark-primary-hover dark:text-dark-text-inverted'
                    }`}
                    disabled={cooldownActive || isSubmittingAnswer}
                  >
                    {isSubmittingAnswer ? 'Submitting...' : cooldownActive ? `Wait ${cooldownTime}s` : 'Submit Answer'}
                </button>
              </form>
            )}
          </div>
        ) : (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 dark:bg-dark-background-tertiary dark:border-gray-700 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-dark-text-tertiary mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-600 dark:text-dark-text-secondary mb-2">
                No active question at the moment
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-text-tertiary">
                When your professor asks a question, it will appear here for you to answer.
            </p>
          </div>
        )}
      </div>
      </div>
    );
  };

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
                  
                  <JoinClass studentId={studentId} onSuccess={handleJoinSuccess} />
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
                        <p className="text-2xl font-bold text-blue-600 dark:text-dark-primary">{sessionCode}</p>
                      </div>
                    </div>
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
          
          {/* Leave Class Button */}
          <button
            onClick={handleLeaveClass}
            className="w-full px-4 py-2 mt-4 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Leave Class
          </button>
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
                    You've joined the class session with code "{sessionCode}". Ask questions and participate in class activities to earn points.
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
    </div>
  );
} 