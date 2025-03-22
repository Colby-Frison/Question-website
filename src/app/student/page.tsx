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
  ACTIVE_QUESTION_COLLECTION
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

// Add this to constant declarations near the top with other collection constants
const STUDENT_POINTS_COLLECTION = 'studentPoints';

/**
 * Utility function to notify the user about a new active question
 * Provides both audio and visual notifications with fallbacks
 */
const notifyNewQuestion = (questionText: string) => {
  console.log("Notifying user of new question:", questionText);
  
  // Try to play a notification sound
  try {
    // Try to create a sound programmatically as fallback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext) {
      // Create a simple beep sound
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5 note
      
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1);
      
      console.log("Played synthesized notification sound");
    }
  } catch (e) {
    console.log('Error creating audio notification:', e);
    // Fallback to alert only if we couldn't play a sound
    alert(`New question from professor: ${questionText}`);
  }
  
  // Flash the title bar to get user attention
  let originalTitle = document.title;
  let notificationCount = 0;
  const maxFlashes = 5;
  
  const flashTitle = () => {
    if (notificationCount > maxFlashes * 2) {
      document.title = originalTitle;
      return;
    }
    
    document.title = notificationCount % 2 === 0 
      ? '🔔 NEW QUESTION!'
      : originalTitle;
    
    notificationCount++;
    setTimeout(flashTitle, 500);
  };
  
  flashTitle();
};

export default function StudentPage() {
  const router = useRouter();
  
  // Add initialization logging
  console.log("== STUDENT PAGE INITIALIZING ==");
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [classQuestions, setClassQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const [initStage, setInitStage] = useState('starting');
  
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
  const pointsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Active question and answer state
  const [activeQuestion, setActiveQuestion] = useState<{id: string, text: string, timestamp: number} | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const lastQuestionCheckRef = useRef<number>(0);
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);
  const [sessionListener, setSessionListener] = useState<(() => void) | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const isFirstLoad = useRef(true);
  const [isLeavingClass, setIsLeavingClass] = useState(false);

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
          setMyQuestions([]);
          setClassQuestions([]);
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
      setMyQuestions([]);
      setClassQuestions([]);
      setActiveQuestion(null);
      
      // Clean up listeners
      if (sessionListener) {
        sessionListener();
        setSessionListener(null);
      }
      
      setIsLeavingClass(false);
    }
  }, [studentId, sessionListener, isLeavingClass, setJoined, setClassName, setSessionCode, 
      setMyQuestions, setClassQuestions, setActiveQuestion, setIsLeavingClass, setSessionListener]);

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
    if (!studentId) {
      console.log("No student ID yet, skipping joined class check");
      return () => {};
    }
    
    setInitStage('checking-joined-class');
    let cleanup: (() => void) | undefined;

    const checkJoinedClass = async () => {
      try {
        console.log("Checking if student has joined a class...");
        // Check if student has already joined a class
        const joinedClass = await getJoinedClass(studentId);
        console.log("Joined class result:", joinedClass);
        
        if (joinedClass && joinedClass.sessionCode) {
          console.log(`Student has joined class: ${joinedClass.className} with session: ${joinedClass.sessionCode}`);
          setClassName(joinedClass.className);
          setSessionCode(joinedClass.sessionCode);
          setJoined(true);
          setInitStage('setting-up-listeners');
          
          console.log(`Setting up question listeners for student ${studentId} in session ${joinedClass.sessionCode}`);
          
          // Set up listener for student's questions - refresh every 10 seconds to reduce load
          console.log("Setting up personal questions listener...");
          const unsubscribePersonal = listenForUserQuestions(studentId, joinedClass.sessionCode, (questions) => {
            console.log(`Received ${questions.length} personal questions`);
            setMyQuestions(questions);
            setIsLoading(false);
          }, { maxWaitTime: 10000 });
          
          // Set up listener for all class questions - refresh every 15 seconds to reduce load
          console.log("Setting up class questions listener...");
          const unsubscribeClass = listenForQuestions(joinedClass.sessionCode, (questions) => {
            console.log(`Received ${questions.length} class questions`);
            setClassQuestions(questions);
          }, { maxWaitTime: 15000, useCache: true });
          
          // Set up listener for active question with loading state and add caching to reduce server calls
          console.log("Setting up active question listener with debouncing and caching...");
          setIsLoadingQuestion(true);
          const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass.sessionCode, (question) => {
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
                
                // Notify user of new question (but only if not first load)
                if (!isFirstLoad.current) {
                  notifyNewQuestion(question.text);
                }
              } else {
                console.log("Received update for existing active question");
              }
            } else {
              console.log("No active question available");
              
              // If we had an active question before but not anymore, it's been removed
              if (activeQuestion) {
                console.log("Active question was removed");
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
          
          // Set up listener for session status changes - no delay as this is critical
          console.log("Setting up session status listener...");
          const unsubscribeSessionStatus = listenForSessionStatus(joinedClass.sessionCode, (status) => {
            console.log(`Session status changed to: ${status}`);
            
            // If the session is closed or archived, leave the class
            if (!status || status === 'closed' || status === 'archived') {
              console.log('Session ended by professor, leaving class...');
              // Call handleLeaveClass directly here
              setJoined(false);
              setClassName('');
              setSessionCode('');
              setMyQuestions([]);
              setClassQuestions([]);
              setActiveQuestion(null);
              
              if (studentId) {
                leaveClass(studentId).catch(console.error);
              }
              
              alert('Class ended: The professor has ended this class session.');
            }
          });
          
          setSessionListener(() => unsubscribeSessionStatus);
          setInitStage('listeners-setup-complete');
          
          // Return cleanup function
          cleanup = () => {
            console.log('Cleaning up question listeners');
            unsubscribePersonal();
            unsubscribeClass();
            unsubscribeActiveQuestion();
            unsubscribeSessionStatus();
          };
        } else {
          console.log("Student has not joined a class");
          setIsLoading(false);
          setInitStage('no-class-joined');
        }
      } catch (error) {
        console.error('Error checking joined class:', error);
        setError('Failed to check if you have joined a class. Please refresh the page.');
        setIsLoading(false);
        setInitStage('joined-class-error');
      }
    };

    checkJoinedClass();
    console.log("== JOINED CLASS EFFECT COMPLETED ==");
    
    // Return the cleanup function
    return () => {
      if (cleanup) cleanup();
    };
  }, [studentId, activeQuestion, isLeavingClass]);

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
      
      // Set up listener for student's questions - refresh every 10 seconds
      console.log(`Setting up personal questions listener...`);
      const unsubscribePersonal = listenForUserQuestions(studentId, code, (questions) => {
        console.log(`Received ${questions.length} personal questions:`, questions);
          setMyQuestions(questions);
      }, { maxWaitTime: 10000 });
      
      // Set up listener for all class questions - refresh every 15 seconds
      console.log(`Setting up class questions listener...`);
      const unsubscribeClass = listenForQuestions(code, (questions) => {
        console.log(`Received ${questions.length} class questions:`, questions);
          setClassQuestions(questions);
      }, { maxWaitTime: 15000, useCache: true });
        
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
      setMyQuestions([]);
        setClassQuestions([]);
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

  /**
   * Render the questions tab content
   */
  const renderQuestionsTab = () => {
    return (
      <div className="space-y-6">
        {activeQuestion && (
          <div className="rounded-lg bg-primary-50 p-4 dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-lg font-bold text-primary dark:text-dark-primary">Question from Professor</h3>
              <span className="rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-800 dark:bg-dark-primary-900/30 dark:text-dark-primary-300">Active Now</span>
            </div>
            <p className="mb-4 text-text-primary dark:text-dark-text-DEFAULT">{activeQuestion.text}</p>
            <form onSubmit={handleAnswerSubmit} className="space-y-3">
              <div>
                <label htmlFor="answer" className="mb-1 block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                  Your Answer
                </label>
                <textarea
                  id="answer"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  className="form-input min-h-[100px] w-full resize-y rounded-md border border-background-tertiary bg-white px-3 py-2 text-text placeholder-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:placeholder-dark-text-tertiary dark:focus:border-dark-primary dark:focus:ring-dark-primary"
                  placeholder="Type your answer here..."
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-DEFAULT"
                >
                  Submit Answer
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Ask a Question</h2>
            <QuestionForm
              sessionCode={sessionCode}
              studentId={studentId}
            />
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Your Questions</h2>
            {myQuestions.length === 0 ? (
              <p className="text-text-secondary dark:text-dark-text-secondary">You haven't asked any questions yet.</p>
            ) : (
              <QuestionList
                questions={myQuestions}
                isProfessor={false}
                isStudent={true}
                studentId={studentId}
                showControls={true}
              />
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <h2 className="mb-4 text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Class Questions</h2>
          {classQuestions.length === 0 ? (
            <p className="text-text-secondary dark:text-dark-text-secondary">No questions from the class yet.</p>
          ) : (
            <ClassQuestionList questions={classQuestions} />
          )}
        </div>
      </div>
    );
  };

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-DEFAULT">Your Points</h2>
              <p className="text-text-secondary dark:text-dark-text-secondary">
                Points are earned by answering questions from your professor.
              </p>
            </div>
            <div className="flex items-center justify-center rounded-full bg-primary-50 px-6 py-3 dark:bg-dark-background-tertiary">
              <span className="text-2xl font-bold text-primary dark:text-dark-primary">{points}</span>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-background-tertiary dark:border-dark-background-tertiary">
            <table className="min-w-full divide-y divide-background-tertiary dark:divide-dark-background-tertiary">
              <thead className="bg-background-secondary dark:bg-dark-background-tertiary">
                <tr>
                  <th scope="col" className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary">
                    Action
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary">
                    Points
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-tertiary bg-white dark:divide-dark-background-tertiary dark:bg-dark-background-secondary">
                <tr>
                  <td className="whitespace-nowrap py-4 px-4 text-sm text-text-primary dark:text-dark-text-DEFAULT">
                    Answer a Question
                  </td>
                  <td className="whitespace-nowrap py-4 px-4 text-sm text-text-primary dark:text-dark-text-DEFAULT">
                    +1 to +5
                  </td>
                  <td className="py-4 px-4 text-sm text-text-secondary dark:text-dark-text-secondary">
                    Submit an answer to a professor's active question. Points awarded based on answer quality.
                  </td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap py-4 px-4 text-sm text-text-primary dark:text-dark-text-DEFAULT">
                    Ask a Question
                  </td>
                  <td className="whitespace-nowrap py-4 px-4 text-sm text-text-primary dark:text-dark-text-DEFAULT">
                    0
                  </td>
                  <td className="py-4 px-4 text-sm text-text-secondary dark:text-dark-text-secondary">
                    Asking questions doesn't directly earn points, but contributes to classroom engagement.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-900 dark:border dark:border-gray-800">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Network Error</h2>
            <p className="mb-4 text-gray-700 dark:text-gray-300">You are currently offline. Please check your internet connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white transition-colors"
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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-900 dark:border dark:border-gray-800">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Error</h2>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{error}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setError(null)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white transition-colors"
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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-500 dark:border-blue-400 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading...</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Stage: {initStage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-background-DEFAULT">
      <Navbar
        title="Student Dashboard"
        subtitle={className || 'Not in a class'}
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
        
        {(networkStatus as 'online' | 'offline') === ('offline' as 'online' | 'offline') && (
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
                  <h3 className="font-bold text-text-primary dark:text-dark-text-DEFAULT">Welcome to the Student Dashboard!</h3>
                  <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                    Join a class using the session code provided by your professor. You can ask anonymous questions
                    and answer questions from your professor to earn points.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowWelcome(false);
                  localStorage.setItem('hideWelcomeStudent', 'true');
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
        ) : !joined ? (
          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <JoinClass 
              onSuccess={(code) => {
                setClassName(className);
                setSessionCode(code);
                setJoined(true);
              }} 
              studentId={studentId}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <h1 className="text-2xl font-bold text-text-primary dark:text-dark-text-DEFAULT">{className}</h1>
                <p className="text-text-secondary dark:text-dark-text-secondary">Session Code: {sessionCode}</p>
              </div>
              
              <div className="flex space-x-2">
                <button 
                  onClick={() => setActiveTab('questions')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'questions' 
                      ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted' 
                      : 'bg-background-secondary text-text-primary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary'
                  }`}
                >
                  Questions
                </button>
                <button
                  onClick={() => setActiveTab('points')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'points' 
                      ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text-inverted' 
                      : 'bg-background-secondary text-text-primary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-DEFAULT dark:hover:bg-dark-background-quaternary'
                  }`}
                >
                  Points
                </button>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to leave this class? You will need the code to rejoin.')) {
                      handleLeaveClass();
                    }
                  }}
                  className="flex items-center rounded-md bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-dark dark:bg-dark-background-tertiary dark:text-error-light dark:hover:bg-dark-background-quaternary"
                >
                  Leave Class
                </button>
              </div>
            </div>

            {/* Only show the active tab content */}
            {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
          </div>
        )}
      </main>
    </div>
  );
} 