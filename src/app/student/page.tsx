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
   * Handle successful class join
   * Sets up state and listeners for the joined class
   * 
   * @param code - The session code of the joined class
   */
  const handleJoinSuccess = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      console.log(`Attempting to join class with session code: ${code}`);
      
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
      <>
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <svg className="mr-2 h-5 w-5 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ask a Question
            </h3>
            <QuestionForm 
              studentId={studentId}
              sessionCode={sessionCode}
            />
          </div>

          <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Class Questions
            </h3>
            <QuestionList 
              questions={classQuestions}
              isProfessor={false}
              isStudent={true}
              studentId={studentId}
              showControls={false}
              emptyMessage="No questions have been asked in this class yet." 
            />
          </div>

          <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <svg className="mr-2 h-5 w-5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              My Questions
            </h3>
            <QuestionList 
              questions={myQuestions} 
              isProfessor={false}
              isStudent={true}
              studentId={studentId}
              showControls={true}
              emptyMessage="You haven't asked any questions yet." 
            />
          </div>
        </div>
      </>
    );
  };

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => {
    return (
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <svg className="mr-2 h-5 w-5 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Your Points
          </h3>
          
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-6 dark:bg-blue-900/10 dark:border-blue-900 dark:text-gray-100">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Points are awarded by your professor when you answer questions correctly. You can also adjust your points using the controls below.
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 mb-6 border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <div className="flex flex-col items-center">
              <div className="mb-6 flex items-center justify-center">
                <button
                  onClick={handleSubtractPoint}
                  className="w-12 h-12 flex items-center justify-center bg-white border border-gray-300 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:focus:ring-blue-400"
                  aria-label="Decrease points"
                >
                  <svg className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                
                <div className="relative mx-6">
                  <div id="points-display" className="text-6xl font-bold text-blue-600 dark:text-blue-400 transition-all duration-300 transform">
                    {points}
                  </div>
                  {isSavingPoints && (
                    <div className="absolute -top-2 -right-2">
                      <div className="animate-spin h-4 w-4 border-t-2 border-blue-500 dark:border-blue-400 rounded-full"></div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleAddPoint}
                  className="w-12 h-12 flex items-center justify-center bg-white border border-gray-300 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:focus:ring-blue-400"
                  aria-label="Increase points"
                >
                  <svg className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
              
              <div className="text-sm text-blue-800 dark:text-blue-200 text-center mb-4">
                Total points earned in this class
              </div>
              
              {isSavingPoints && (
                <div className="mb-4 text-xs text-blue-600 dark:text-blue-300 flex items-center">
                  <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </div>
              )}
              
              <div className="w-full flex flex-col space-y-3">
                <button
                  onClick={refreshStudentPoints}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 flex items-center justify-center dark:bg-blue-600/90 dark:hover:bg-blue-700 dark:text-gray-100"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Points
                </button>
                
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  <input 
                    type="text" 
                    value={pointsInput}
                    onChange={handlePointsInputChange}
                    className="flex-grow p-2 border-r border-gray-300 dark:border-gray-600 text-center dark:bg-gray-700 dark:text-gray-100"
                    aria-label="Set points value"
                  />
                  <button
                    onClick={handleSetPoints}
                    className="px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Answer Professor's Question
          </h3>
          
          {activeQuestion ? (
            <div>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-900/10 dark:border-blue-900 dark:text-white">
                <h3 className="font-semibold mb-2">Current Question:</h3>
                <p className="font-medium">{activeQuestion.text}</p>
              </div>
              
              {answerSubmitted ? (
                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-white">
                  <p className="font-semibold">Your answer has been submitted!</p>
                  <p className="mt-2 text-sm">The professor will review your answer and may award points.</p>
                </div>
              ) : (
                <form onSubmit={handleAnswerSubmit} className="mt-4">
                  <div className="mb-4">
                    <label htmlFor="pointsTabAnswerText" className="block mb-2 font-semibold">
                      Your Answer:
                    </label>
                    <textarea
                      id="pointsTabAnswerText"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition duration-200"
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
                        : 'bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600/90 dark:hover:bg-blue-700 dark:text-gray-100'
                    }`}
                    disabled={cooldownActive || isSubmittingAnswer}
                  >
                    {isSubmittingAnswer ? 'Submitting...' : cooldownActive ? `Wait ${cooldownTime}s` : 'Submit Answer'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-6 bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                No active question at the moment
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                When your professor asks a question, it will appear here for you to answer.
              </p>
            </div>
          )}
        </div>
        
        <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <svg className="mr-2 h-5 w-5 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Points History
          </h3>
          <div className="text-gray-600 dark:text-gray-400 text-center p-4">
            Coming soon: A detailed history of your points changes for this class session.
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
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-500">Network Error</h2>
            <p className="mb-4 text-gray-700 dark:text-gray-300">You are currently offline. Please check your internet connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600/90 dark:hover:bg-blue-700 dark:text-gray-100 transition-colors"
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
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-500">Error</h2>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{error}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setError(null)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600/90 dark:hover:bg-blue-700 dark:text-gray-100 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:bg-green-600/90 dark:hover:bg-green-700 dark:text-gray-100 transition-colors"
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-6">
        {!joined ? (
          <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
            <div className="max-w-sm w-full mx-auto">
              <div className="bg-white shadow-md rounded-lg overflow-hidden dark:bg-gray-900 dark:border dark:border-gray-800">
                <div className="p-8">
                  <h2 className="text-xl font-bold mb-6 text-center">Join a Class</h2>
                  
                  <div className="group relative mb-4">
                    <div className="flex items-center mb-1 justify-center">
                      <label htmlFor="infoSessionCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Session Code
                      </label>
                      <div className="relative ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute top-0 left-full transform -translate-y-1/2 mt-1 ml-1 w-60 p-2 bg-gray-800 text-xs text-white rounded-md shadow-lg z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          Enter the 6-digit code provided by your professor
                        </div>
                        <svg className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6 sticky top-6">
                {error && (
                  <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg dark:bg-red-900/20 dark:text-red-300 dark:border dark:border-red-800">
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <h2 className="text-xl font-bold mb-4 flex items-center">
                  <svg className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Class Information
                </h2>

                <div className="space-y-4">
                  {/* Session Information Section */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                    <h3 className="font-medium mb-2 flex items-center">
                      <svg className="mr-2 h-4 w-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Session Details
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center dark:bg-blue-900/10 dark:border-blue-900 dark:text-gray-100">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Class:</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{className}</p>
                      </div>
                      
                      <div className="p-3 bg-gray-100 border border-gray-200 rounded-md text-center dark:bg-gray-800 dark:border-gray-700">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Session Code:</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sessionCode}</p>
                      </div>
                      
                      <button
                        onClick={handleLeaveClass}
                        disabled={isLeavingClass}
                        className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors dark:bg-red-600/90 dark:hover:bg-red-700 dark:text-gray-100 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isLeavingClass ? (
                          <>
                            <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Leaving...</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Leave Class</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                    <h3 className="font-medium mb-2 flex items-center">
                      <svg className="mr-2 h-4 w-4 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                      Dashboard Views
                    </h3>
                    
                    <div className="flex border rounded-md overflow-hidden">
                      <button
                        onClick={() => setActiveTab('questions')}
                        className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                          activeTab === 'questions'
                            ? 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white'
                            : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-850 dark:border-r dark:border-gray-700'
                        }`}
                      >
                        Questions
                      </button>
                      <button
                        onClick={() => setActiveTab('points')}
                        className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                          activeTab === 'points'
                            ? 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white'
                            : 'bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-850'
                        }`}
                      >
                        My Points
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 mt-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center space-x-2"
                  >
                    <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="w-full lg:w-2/3">
              {/* Welcome Message */}
              <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow-md rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold mb-2 flex items-center">
                  <svg className="mr-2 h-6 w-6 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Welcome, Student!
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  You've joined the class session with code "{sessionCode}". Ask questions and participate in class activities to earn points.
                </p>
              </div>

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