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
  runDatabaseMaintenance
} from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { getSessionByCode, listenForSessionStatus } from '@/lib/classSession';
import { Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';
import { checkFirebaseConnection } from '@/lib/firebase';
import { runQuestionSystemTest } from '@/lib/qa-test';
import { runFirebaseDiagnostics } from '@/lib/firebase-diagnostic';

// Define tab types for the dashboard
type TabType = 'questions' | 'points';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const lastQuestionCheckRef = useRef<number>(0);
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);
  const [sessionListener, setSessionListener] = useState<(() => void) | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Define handleLeaveClass outside the component
  const handleLeaveClass = useCallback(() => {
    console.log('Student leaving class');
    setJoined(false);
    setClassName('');
    setSessionCode('');
    setMyQuestions([]);
    setClassQuestions([]);
    setActiveQuestion(null);

    // Clean up Firebase data
    if (studentId) {
      leaveClass(studentId).catch(console.error);
    }

    // Clean up listeners
    if (sessionListener) {
      sessionListener();
      setSessionListener(null);
    }
  }, [studentId, sessionListener]);

  /**
   * Effect to save points to localStorage and database when they change
   * Uses a debounce pattern to avoid excessive database writes
   */
  useEffect(() => {
    // Save points to localStorage whenever they change
    if (typeof window !== 'undefined') {
      localStorage.setItem('studentPoints', points.toString());
      setPointsInput(points.toString());
      
      // Set up debounced save to database
      if (studentId) {
        // Clear any existing timeout
        if (pointsSaveTimeoutRef.current) {
          clearTimeout(pointsSaveTimeoutRef.current);
        }
        
        setIsSavingPoints(true);
        
        // Set a new timeout to save to database after 2 seconds of inactivity
        pointsSaveTimeoutRef.current = setTimeout(async () => {
          try {
            console.log(`Saving points to database: ${points}`);
            // Get current points from database
            let currentPoints = 0;
            
            // Use a promise to get the current points value
            await new Promise<void>((resolve) => {
              const unsubscribe = listenForStudentPoints(studentId, (dbPoints) => {
                currentPoints = dbPoints;
                unsubscribe();
                resolve();
              });
            });
            
            // Calculate the difference to update
            const pointsDifference = points - currentPoints;
            
            if (pointsDifference !== 0) {
              await updateStudentPoints(studentId, pointsDifference);
              console.log(`Points saved to database. Difference: ${pointsDifference}`);
            }
          } catch (error) {
            console.error("Error saving points to database:", error);
          } finally {
            setIsSavingPoints(false);
          }
        }, 2000);
      }
    }
    
    // Cleanup function to clear timeout
    return () => {
      if (pointsSaveTimeoutRef.current) {
        clearTimeout(pointsSaveTimeoutRef.current);
      }
    };
  }, [points, studentId]);

  /**
   * Set up real-time listener for student points from Firestore
   * Updates the points state when changes occur in the database
   */
  useEffect(() => {
    if (!studentId) return () => {};
    
    console.log("Setting up points listener for student:", studentId);
    const unsubscribe = listenForStudentPoints(studentId, (newPoints) => {
      console.log("Received points update:", newPoints);
      setPoints(newPoints);
    });
    
    return () => {
      console.log("Cleaning up points listener");
      unsubscribe();
    };
  }, [studentId]);

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
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      console.log("== STUDENT PAGE UNMOUNTED ==");
    };
    
    // This effect should only run once on mount and when router changes
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
          
          // Set up listener for active question with loading state - refresh every 5 seconds since it's more critical
          console.log("Setting up active question listener...");
          setIsLoadingQuestion(true);
          const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass.sessionCode, (question) => {
            console.log("Active question update:", question ? "received" : "none");
            
            // If the active question changes, reset the answer state
            if (question?.id !== activeQuestion?.id) {
              setAnswerText('');
              setAnswerSubmitted(false);
            }
            
            setActiveQuestion(question);
            setIsLoadingQuestion(false);
            lastQuestionCheckRef.current = Date.now();
          }, { maxWaitTime: 5000 });
          
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
  }, [studentId, activeQuestion]); // Remove handleLeaveClass from the dependency array

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
   * Handle adding a point to student's total
   * Increments points by 1
   */
  const handleAddPoint = () => {
    setPoints(prevPoints => prevPoints + 1);
  };

  /**
   * Handle subtracting a point from student's total
   * Decrements points by 1, but not below 0
   */
  const handleSubtractPoint = () => {
    setPoints(prevPoints => Math.max(0, prevPoints - 1));
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
   * Handle setting points to a specific value
   * Validates input and updates points state
   */
  const handleSetPoints = () => {
    const newPoints = parseInt(pointsInput, 10);
    if (!isNaN(newPoints) && newPoints >= 0) {
      setPoints(newPoints);
    } else {
      // Reset input to current points if invalid
      setPointsInput(points.toString());
    }
  };

  /**
   * Handle submitting an answer to an active question
   * Sends the answer to the database and updates UI
   * 
   * @param e - The form submit event
   */
  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!answerText.trim() || !activeQuestion || !studentId || !sessionCode) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Submit answer to the database
      await addAnswer({
        text: answerText.trim(),
        activeQuestionId: activeQuestion.id,
        studentId,
        sessionCode,
        questionText: activeQuestion.text
      });
      
      // Update UI
      setAnswerSubmitted(true);
      setAnswerText('');
      
      // Set cooldown to prevent spam
      setCooldownActive(true);
      setCooldownTime(10); // 10 second cooldown
      
      const cooldownInterval = setInterval(() => {
        setCooldownTime(prevTime => {
          if (prevTime <= 1) {
            clearInterval(cooldownInterval);
            setCooldownActive(false);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
      
      setIsSubmitting(false);
    } catch (error) {
      console.error('Error submitting answer:', error);
      setError('Failed to submit answer. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Add this debug function to the component
  const runDebugTest = async () => {
    console.log("Running debug test...");
    if (!studentId || !sessionCode) {
      console.error("Cannot run test: Missing studentId or sessionCode");
      alert("Please join a class first to run the test.");
      return;
    }
    
    try {
      const result = await runQuestionSystemTest(studentId, sessionCode);
      if (result) {
        console.log("Debug test completed successfully!");
        alert("Debug test passed! Check the browser console for details.");
      } else {
        console.error("Debug test failed. See console for details.");
        alert("Debug test failed. Check the browser console for errors.");
      }
    } catch (error) {
      console.error("Error running debug test:", error);
      alert("Error running debug test. Check the browser console for details.");
    }
  };

  // Add this function for the diagnostic button
  const runDiagnostics = async () => {
    console.log("Running Firebase diagnostics...");
    
    try {
      setIsLoading(true);
      setInitStage('running-diagnostics');
      
      const results = await runFirebaseDiagnostics();
      
      // Create a formatted report
      const report = results.map(result => {
        return `Stage: ${result.stage}\nSuccess: ${result.success ? 'Yes' : 'No'}\nMessage: ${result.message}${
          result.error ? `\nError: ${result.error.message || String(result.error)}` : ''
        }`;
      }).join('\n\n');
      
      console.log("Diagnostic results:", results);
      
      // Show results to user
      alert(`Firebase Diagnostic Results:\n\n${report}`);
      
      // If there are failures, set an error
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        setError(`Firebase connection issues detected: ${failures[0].message}`);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error running diagnostics:", error);
      setError(`Failed to run diagnostics: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  };

  /**
   * Render the questions tab content
   */
  const renderQuestionsTab = () => (
    <div className="p-4">
      <div className="bg-white shadow-md rounded-lg p-4 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Ask a Question</h2>
        <QuestionForm 
          studentId={studentId}
          sessionCode={sessionCode}
        />
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-4 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">My Questions</h2>
        {myQuestions.length > 0 ? (
          <QuestionList 
            questions={myQuestions}
            isProfessor={false}
            isStudent={true}
            studentId={studentId}
            emptyMessage="You haven't asked any questions yet."
          />
        ) : (
          <p>You haven't asked any questions yet.</p>
        )}
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-4 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Class Questions</h2>
        {classQuestions.length > 0 ? (
          <QuestionList 
            questions={classQuestions}
            isProfessor={false}
            isStudent={true}
            studentId={studentId}
            emptyMessage="No questions from the class yet."
          />
        ) : (
          <p>No questions from other students yet.</p>
        )}
      </div>
      
      {/* Active question from professor */}
      {activeQuestion && (
        <div className="bg-yellow-50 shadow-md rounded-lg p-4 mb-6 dark:bg-yellow-900 dark:text-white">
          <h2 className="text-xl font-bold mb-4">Professor's Question</h2>
          <div className="mb-4 p-3 bg-white rounded dark:bg-gray-800">
            {activeQuestion.text}
          </div>
          
          {answerSubmitted ? (
            <div className="bg-green-100 p-3 rounded dark:bg-green-800 dark:text-white">
              <p className="font-semibold">Your answer has been submitted!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitAnswer}>
              <div className="mb-4">
                <label htmlFor="answerText" className="block mb-1 font-semibold">
                  Your Answer:
                </label>
                <textarea
                  id="answerText"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  rows={3}
                  disabled={cooldownActive}
                  required
                />
              </div>
              <button
                type="submit"
                className={`px-4 py-2 rounded ${
                  cooldownActive || isSubmitting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700'
                }`}
                disabled={cooldownActive || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : cooldownActive ? `Wait ${cooldownTime}s` : 'Submit Answer'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );

  /**
   * Render the points tab content
   */
  const renderPointsTab = () => (
    <div className="p-4">
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Your Points</h2>
        
        <div className="flex items-center justify-center mb-6">
          <div className="text-center">
            <div className="text-5xl font-bold mb-2">{points}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {isSavingPoints ? 'Saving...' : 'Total Points'}
            </div>
          </div>
        </div>
        
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={handleSubtractPoint}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-800 dark:text-red-100 dark:hover:bg-red-700"
          >
            -1
          </button>
          <button
            onClick={handleAddPoint}
            className="px-4 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700"
          >
            +1
          </button>
        </div>
        
        <div className="flex items-center justify-center">
          <input
            type="text"
            value={pointsInput}
            onChange={handlePointsInputChange}
            className="w-20 p-2 border rounded text-center mr-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
          <button
            onClick={handleSetPoints}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Set Points
          </button>
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">How Points Work</h2>
        <p className="mb-4">
          You can earn points by answering questions from your professor.
          The professor will award points based on the quality of your answers.
        </p>
        <p className="mb-4">
          You can manually adjust your points for testing purposes, but in a real classroom
          setting, only the professor would award points.
        </p>
      </div>
    </div>
  );

  // Show network error if offline
  if (networkStatus === 'offline') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-800">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Network Error</h2>
            <p className="mb-4">You are currently offline. Please check your internet connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
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
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white shadow-md rounded-lg p-6 max-w-md w-full dark:bg-gray-800">
            <h2 className="text-red-600 text-2xl font-bold mb-4 dark:text-red-400">Error</h2>
            <p className="mb-4">{error}</p>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">Initialization stage: {initStage}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setError(null)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Dismiss
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
              >
                Refresh Page
              </button>
              <a
                href="/diagnose"
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-center mt-2"
              >
                Go to Diagnostic Page
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
        <Navbar userType="student" onLogout={handleLogout} />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-lg">Loading...</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Stage: {initStage}</p>
            
            <div className="flex flex-col items-center gap-2 mt-4">
              {/* Add diagnostic button during loading */}
              <button
                onClick={runDiagnostics}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Run Connection Diagnostics
              </button>
              
              <a
                href="/diagnose"
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
              >
                Go to Diagnostic Page
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col dark:bg-gray-900 dark:text-white">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-6">
        {!joined ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white shadow-md rounded-lg p-6 dark:bg-gray-800">
              <h1 className="text-2xl font-bold mb-4">Student Dashboard</h1>
              <h2 className="text-xl font-bold mb-4">Join a Class</h2>
              <p className="mb-4">
                Enter the session code provided by your professor to join the current class session.
              </p>
              <JoinClass studentId={studentId} onSuccess={handleJoinSuccess} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Main Content Area */}
            <div className="w-full lg:w-2/3">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold mb-2">Student Dashboard</h1>
                  <h2 className="text-lg mb-1">Class: {className}</h2>
                </div>
              </div>
              
              <div className="bg-white shadow-md rounded-lg p-4 mb-6 dark:bg-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">Session Code:</span> <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded text-lg">{sessionCode}</span>
                  </div>
                  <div className="flex gap-2">
                    {process.env.NODE_ENV === 'development' && (
                      <>
                        <button
                          onClick={runDebugTest}
                          className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                          Run Debug Test
                        </button>
                        <button
                          onClick={runDiagnostics}
                          className="px-4 py-2 rounded bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
                        >
                          Run Diagnostics
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleLeaveClass}
                      className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                    >
                      Leave Class
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="border-b dark:border-gray-700">
                  <div className="flex">
                    <button
                      className={`px-4 py-2 ${
                        activeTab === 'questions' 
                          ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                      onClick={() => setActiveTab('questions')}
                    >
                      Questions
                    </button>
                    <button
                      className={`px-4 py-2 ${
                        activeTab === 'points' 
                          ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                      onClick={() => setActiveTab('points')}
                    >
                      My Points
                    </button>
                  </div>
                </div>
                
                <div className="mt-4">
                  {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
                </div>
              </div>
            </div>
            
            {/* Active Question Sidebar - only shown in questions tab */}
            {activeTab === 'questions' && activeQuestion && (
              <div className="w-full lg:w-1/3 mt-6 lg:mt-0">
                <div className="bg-yellow-50 shadow-md rounded-lg p-4 sticky top-4 dark:bg-yellow-900 dark:text-white">
                  <h2 className="text-xl font-bold mb-4">Professor's Question</h2>
                  <div className="mb-4 p-3 bg-white rounded dark:bg-gray-800">
                    {activeQuestion.text}
                  </div>
                  
                  {answerSubmitted ? (
                    <div className="bg-green-100 p-3 rounded dark:bg-green-800 dark:text-white">
                      <p className="font-semibold">Your answer has been submitted!</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitAnswer}>
                      <div className="mb-4">
                        <label htmlFor="answerText" className="block mb-1 font-semibold">
                          Your Answer:
                        </label>
                        <textarea
                          id="answerText"
                          value={answerText}
                          onChange={(e) => setAnswerText(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
                          rows={3}
                          disabled={cooldownActive}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className={`w-full px-4 py-2 rounded ${
                          cooldownActive || isSubmitting
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700'
                        }`}
                        disabled={cooldownActive || isSubmitting}
                      >
                        {isSubmitting ? 'Submitting...' : cooldownActive ? `Wait ${cooldownTime}s` : 'Submit Answer'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 