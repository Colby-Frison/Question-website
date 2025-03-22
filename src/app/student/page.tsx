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
        {/* Welcome message */}
        {showWelcome && (
          <div className="flex items-center justify-between rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <div>
              <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">👋 Welcome to Your Student Dashboard</h2>
              <p className="mt-1 text-text-secondary dark:text-dark-text-secondary">
                Ask questions anonymously and earn points for your participation.
              </p>
            </div>
            <button 
              onClick={() => {
                setShowWelcome(false);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('hideWelcomeStudent', 'true');
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

        {/* Active question section */}
        {activeQuestion && (
          <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Active Question</h2>
            
            <div className="mb-4 rounded-md bg-background-secondary p-4 text-text-primary dark:bg-dark-background-tertiary dark:text-dark-text-primary">
              {activeQuestion.text}
            </div>
            
            {answerSubmitted ? (
              <div className="rounded-md bg-success-light/30 p-4 text-success-dark dark:bg-success-light/20 dark:text-success-light">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-success-dark dark:text-success-light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p>Your answer has been submitted. Wait for the next question!</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAnswerSubmit} className="space-y-4">
                <div>
                  <label 
                    htmlFor="answer-text" 
                    className="mb-1 block text-sm font-medium text-text-primary dark:text-dark-text-primary"
                  >
                    Your Answer
                  </label>
                  <textarea
                    id="answer-text"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full rounded-md border border-background-tertiary bg-white px-3 py-2 text-text placeholder-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text dark:placeholder-dark-text-tertiary dark:focus:border-dark-primary dark:focus:ring-dark-primary"
                    rows={3}
                    required
                  />
                </div>
                
                <div>
                  <button
                    type="submit"
                    disabled={isSubmittingAnswer || !answerText.trim() || cooldownActive}
                    className="rounded-md bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-secondary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
                  >
                    {isSubmittingAnswer ? 'Submitting...' : 'Submit Answer'}
                  </button>
                  
                  {cooldownActive && (
                    <p className="mt-2 text-sm text-warning-dark dark:text-warning-light">
                      Please wait {cooldownTime} seconds before answering again.
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* Ask a question section */}
        {joined && !activeQuestion && (
          <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Ask a Question</h2>
            <QuestionForm sessionCode={sessionCode} studentId={studentId} />
          </div>
        )}

        {/* My questions section */}
        {joined && myQuestions.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">My Questions</h2>
            <QuestionList 
              questions={myQuestions} 
              isProfessor={false} 
              isStudent={true} 
              studentId={studentId} 
            />
          </div>
        )}

        {/* Class questions section */}
        {joined && classQuestions.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
            <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Class Questions</h2>
            <ClassQuestionList questions={classQuestions} />
          </div>
        )}
      </div>
    );
  };

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => {
    return (
      <div className="space-y-6">
        {/* Points information */}
        <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
          <div className="text-center">
            <h2 className="mb-3 text-xl font-semibold text-text-primary dark:text-dark-text-primary">My Points</h2>
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-primary-50 p-6 dark:bg-dark-background-tertiary">
              <span className="text-4xl font-bold text-primary dark:text-dark-primary">{points}</span>
            </div>
            <p className="text-text-secondary dark:text-dark-text-secondary">
              Points are awarded by the professor for participating in class and answering questions correctly.
            </p>
          </div>

          {/* Self-reporting point adjustment */}
          <div className="mt-8">
            <h3 className="mb-3 text-lg font-medium text-text-primary dark:text-dark-text-primary">Self-Report Points</h3>
            <p className="mb-4 text-text-secondary dark:text-dark-text-secondary">
              If the professor has instructed you to adjust your points, you can do so here.
            </p>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSubtractPoint}
                className="rounded-md bg-background-secondary px-3 py-2 text-text-primary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-primary dark:hover:bg-dark-background-quaternary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              
              <input
                type="number"
                value={pointsInput}
                onChange={handlePointsInputChange}
                className="w-20 rounded-md border border-background-tertiary bg-white px-3 py-2 text-center text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text dark:focus:border-dark-primary dark:focus:ring-dark-primary"
              />
              
              <button
                onClick={handleAddPoint}
                className="rounded-md bg-background-secondary px-3 py-2 text-text-primary transition-colors hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-primary dark:hover:bg-dark-background-quaternary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
              
              <button
                onClick={handleSetPoints}
                disabled={isSavingPoints}
                className="ml-2 rounded-md bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:focus:ring-offset-dark-background-secondary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
              >
                {isSavingPoints ? 'Saving...' : 'Save Points'}
              </button>
            </div>
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
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading...</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Stage: {initStage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background-default">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <main className="flex-grow p-4">
        <div className="mx-auto max-w-6xl space-y-6">
          
          {/* Error state */}
          {error && (
            <div className="rounded-lg bg-error-light/30 p-4 text-error-dark dark:bg-error-light/20 dark:text-error-light">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-error-dark dark:text-error-light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Network status alert */}
          {networkStatus !== 'online' && (
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
          
          {/* Join Class section */}
          {!joined ? (
            <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
              <h2 className="mb-4 text-xl font-semibold text-text-primary dark:text-dark-text-primary">Join a Class</h2>
              <JoinClass 
                onSuccess={(code) => {
                  // Set the session code from the join response
                  setSessionCode(code);
                  
                  // Get the full class details
                  getJoinedClass(studentId).then(joinedClass => {
                    if (joinedClass) {
                      setSessionCode(joinedClass.sessionCode);
                      setClassName(joinedClass.className);
                      setJoined(true);
                    }
                  });
                }} 
                studentId={studentId}
              />
            </div>
          ) : (
            <>
              {/* Class Info Banner */}
              <div className="rounded-lg bg-white p-6 shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all dark:bg-dark-background-secondary dark:shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
                      {className || 'Class Session'}
                    </h2>
                    <p className="text-text-secondary dark:text-dark-text-secondary">
                      Session Code: <span className="font-medium">{sessionCode}</span>
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-background-secondary px-3 py-2 text-text-secondary dark:bg-dark-background-tertiary dark:text-dark-text-secondary">
                      <span className="font-medium text-primary dark:text-dark-primary">{points}</span> points
                    </div>
                    
                    <button
                      onClick={handleLeaveClass}
                      disabled={isLeavingClass}
                      className="rounded-md bg-error px-4 py-2 text-white transition-colors hover:bg-error-dark focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 disabled:bg-background-tertiary disabled:text-text-tertiary dark:bg-error dark:text-dark-text-inverted dark:hover:bg-error-dark dark:focus:ring-error dark:focus:ring-offset-dark-background-secondary dark:disabled:bg-dark-background-tertiary dark:disabled:text-dark-text-tertiary"
                    >
                      {isLeavingClass ? 'Leaving...' : 'Leave Class'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Tab Navigation */}
              <div className="border-b border-background-tertiary dark:border-dark-background-tertiary">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('questions')}
                    className={`cursor-pointer border-b-2 py-2 px-1 text-sm font-medium ${
                      activeTab === 'questions'
                        ? 'border-primary text-primary dark:border-dark-primary dark:text-dark-primary'
                        : 'border-transparent text-text-secondary hover:border-background-tertiary hover:text-text-primary dark:text-dark-text-secondary dark:hover:border-dark-background-tertiary dark:hover:text-dark-text-primary'
                    }`}
                  >
                    Questions
                  </button>
                  <button
                    onClick={() => setActiveTab('points')}
                    className={`cursor-pointer border-b-2 py-2 px-1 text-sm font-medium ${
                      activeTab === 'points'
                        ? 'border-primary text-primary dark:border-dark-primary dark:text-dark-primary'
                        : 'border-transparent text-text-secondary hover:border-background-tertiary hover:text-text-primary dark:text-dark-text-secondary dark:hover:border-dark-background-tertiary dark:hover:text-dark-text-primary'
                    }`}
                  >
                    My Points
                  </button>
                </nav>
              </div>
              
              {/* Tab Content */}
              {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
            </>
          )}
          
          {/* Loading state */}
          {isLoading && (
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
            </div>
          )}
        </div>
      </main>
      
      <footer className="border-t border-background-tertiary p-4 text-center text-sm text-text-secondary dark:border-dark-background-tertiary dark:text-dark-text-secondary">
        &copy; {new Date().getFullYear()} Classroom Q&A - Student Dashboard
      </footer>
    </div>
  );
} 