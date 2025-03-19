'use client';

/**
 * Student Dashboard Page
 * 
 * This component serves as the main dashboard for students, allowing them to:
 * - Join a class using a class code
 * - Ask questions to the professor
 * - View questions from other students
 * - Answer active questions from the professor
 * - Track and manage their points
 * 
 * The page handles real-time updates through Firebase listeners and
 * manages the student's class session and points.
 */

import { useState, useEffect, useRef } from 'react';
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
import { Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';

// Define tab types for the dashboard
type TabType = 'questions' | 'points';

export default function StudentPage() {
  const router = useRouter();
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [classQuestions, setClassQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  
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
    // Check if user is a student
    if (!isStudent()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setStudentId(userId);

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
    if (!studentId) return;

    const checkJoinedClass = async () => {
      try {
        // Check if student has already joined a class
        const joinedClass = await getJoinedClass(studentId);
        
        if (joinedClass) {
          setClassName(joinedClass);
          setJoined(true);
          
          // Set up listener for student's questions
          const unsubscribePersonal = listenForUserQuestions(studentId, joinedClass, (questions) => {
            setMyQuestions(questions);
            setIsLoading(false);
          });
          
          // Set up listener for all class questions
          const unsubscribeClass = listenForQuestions(joinedClass, (questions) => {
            setClassQuestions(questions);
          });
          
          // Set up listener for active question with loading state
          setIsLoadingQuestion(true);
          const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass, (question) => {
            console.log("Active question update:", question);
            
            // If the active question changes, reset the answer state
            if (question?.id !== activeQuestion?.id) {
              setAnswerText('');
              setAnswerSubmitted(false);
            }
            
            setActiveQuestion(question);
            setIsLoadingQuestion(false);
            lastQuestionCheckRef.current = Date.now();
          });
          
          return () => {
            unsubscribePersonal();
            unsubscribeClass();
            unsubscribeActiveQuestion();
          };
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking joined class:', error);
        setError('Failed to check joined class. Please refresh the page.');
        setIsLoading(false);
      }
    };

    checkJoinedClass();
  }, [studentId]);

  /**
   * Effect to handle active question changes
   * This is separated from the main listener to avoid excessive re-renders
   */
  useEffect(() => {
    if (!activeQuestion || !studentId || !className) return;
    
    // This effect handles changes to the active question
    console.log("Active question changed:", activeQuestion.id);
    
  }, [activeQuestion, studentId, className]);

  /**
   * Handle successful class join
   * Sets up listeners for questions and active questions
   */
  const handleJoinSuccess = async () => {
    try {
      // Refresh joined class
      const joinedClass = await getJoinedClass(studentId);
      
      if (joinedClass) {
        setClassName(joinedClass);
        setJoined(true);
        
        // Set up listener for student's questions
        const unsubscribePersonal = listenForUserQuestions(studentId, joinedClass, (questions) => {
          setMyQuestions(questions);
        });
        
        // Set up listener for all class questions
        const unsubscribeClass = listenForQuestions(joinedClass, (questions) => {
          setClassQuestions(questions);
        });
        
        // Set up listener for active question with loading state
        setIsLoadingQuestion(true);
        const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass, (question) => {
          console.log("Active question update:", question);
          setActiveQuestion(question);
          setAnswerText('');
          setAnswerSubmitted(false);
          setIsLoadingQuestion(false);
          lastQuestionCheckRef.current = Date.now();
        });
        
        // Run database maintenance in the background when a student joins
        runDatabaseMaintenance()
          .then(result => {
            console.log("Automatic maintenance completed on student join:", result);
          })
          .catch(error => {
            console.error("Error during automatic maintenance on student join:", error);
            // Don't show error to student, just log it
        });
      }
    } catch (error) {
      console.error('Error after joining class:', error);
      setError('Failed to load questions. Please refresh the page.');
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
   * Handle leaving a class
   * Clears class state and removes the student from the class
   */
  const handleLeaveClass = async () => {
    try {
      const success = await leaveClass(studentId);
      
      if (success) {
        setClassName('');
      setJoined(false);
      setMyQuestions([]);
        setClassQuestions([]);
        setActiveQuestion(null);
      }
    } catch (error) {
      console.error('Error leaving class:', error);
      setError('Failed to leave class. Please try again.');
    }
  };

  /**
   * Handle adding a point to the student's total
   */
  const handleAddPoint = () => {
    setPoints(prevPoints => prevPoints + 1);
  };

  /**
   * Handle subtracting a point from the student's total
   * Ensures points don't go below zero
   */
  const handleSubtractPoint = () => {
    setPoints(prevPoints => Math.max(0, prevPoints - 1));
  };

  /**
   * Handle changes to the points input field
   * Ensures only valid numbers are entered
   * 
   * @param e - Input change event
   */
  const handlePointsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setPoints(numValue);
    }
  };

  /**
   * Handle setting points via a prompt
   * Shows a dialog to enter a specific number of points
   */
  const handleSetPoints = () => {
    const newPoints = window.prompt("Enter points:");
    if (newPoints !== null) {
      const numValue = parseInt(newPoints, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        setPoints(numValue);
      }
    }
  };
  
  /**
   * Handle submitting an answer to the active question
   * Adds the answer to the database and starts a cooldown timer
   * 
   * @param e - Form submit event
   */
  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!answerText.trim() || !activeQuestion || !studentId || !className || cooldownActive) {
      console.error("Missing required fields for submitting answer or cooldown is active");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const answerId = await addAnswer(activeQuestion.id, answerText, studentId, className);
      
      if (answerId) {
        console.log("Answer submitted successfully with ID:", answerId);
        setAnswerSubmitted(true);
        setAnswerText('');
        
        // Start cooldown
        setCooldownActive(true);
        setCooldownTime(10);
        
        // Set up cooldown timer
        const cooldownInterval = setInterval(() => {
          setCooldownTime(prevTime => {
            const newTime = prevTime - 1;
            if (newTime <= 0) {
              clearInterval(cooldownInterval);
              setCooldownActive(false);
              setAnswerSubmitted(false);
              return 0;
            }
            return newTime;
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      setError("Failed to submit answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Render the Questions tab content
   * Shows join class form, question form, and lists of questions
   */
  const renderQuestionsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Left container - Personal content */}
      <div className="lg:col-span-3">
        {!joined ? (
          <div className="mb-8">
          <JoinClass onJoin={handleJoinSuccess} studentId={studentId} />
          </div>
        ) : (
          <div className="mb-8 rounded-lg bg-white p-6 shadow-all-around dark:bg-dark-background-secondary">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-text dark:text-dark-text">Current Class</h2>
                <p className="mt-1 text-text-secondary dark:text-dark-text-secondary">
                  {className}
                </p>
                </div>
                <button
                  onClick={handleLeaveClass}
                className="mt-4 rounded-md bg-error-light/20 px-4 py-2 text-sm font-medium text-error-dark transition-colors hover:bg-error-light/30 sm:mt-0 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20"
                >
                  Leave Class
                </button>
              </div>
            </div>
        )}

            <div className="mb-8">
          {!joined ? (
            <div className="rounded-lg bg-background-secondary p-6 dark:bg-dark-background-tertiary relative">
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-dark-background/50 rounded-lg z-10">
                <p className="text-text-secondary dark:text-dark-text-secondary font-medium">Please join a class to ask questions</p>
              </div>
              <div className="opacity-50 pointer-events-none">
                <QuestionForm userIdentifier={studentId} classCode="" />
              </div>
            </div>
          ) : (
            <QuestionForm userIdentifier={studentId} classCode={className} />
          )}
            </div>

        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
              <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">My Questions</h2>
          {!joined ? (
            <div className="py-8 text-center text-text-secondary dark:text-dark-text-secondary">
              Please join a class to see your questions
            </div>
          ) : (
              <QuestionList 
                questions={myQuestions} 
                emptyMessage="You haven't asked any questions yet."
                isLoading={isLoading}
              isStudent={true}
              studentId={studentId}
            />
          )}
        </div>
      </div>
      
      {/* Right container - Class questions */}
      <div className="lg:col-span-2">
        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary h-full">
          {!joined ? (
            <div className="h-full flex flex-col">
              <h2 className="text-lg font-semibold mb-4 text-text dark:text-dark-text">Class Questions</h2>
              <div className="flex-1 flex items-center justify-center text-text-secondary dark:text-dark-text-secondary">
                Please join a class to see questions
              </div>
            </div>
          ) : (
            <ClassQuestionList
              questions={classQuestions}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );

  /**
   * Render the Points tab content
   * Shows active question answer form and points counter
   */
  const renderPointsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Answer Questions Section */}
      <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
        <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Answer Questions</h2>
        {!joined ? (
          <div className="py-8 text-center text-text-secondary dark:text-dark-text-secondary">
            Please join a class to answer questions and earn points
          </div>
        ) : isLoadingQuestion ? (
          <div className="py-8 text-center">
            <div className="flex flex-col items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary mb-2"></div>
              <p className="text-text-secondary dark:text-dark-text-secondary">
                Loading question...
              </p>
            </div>
          </div>
        ) : activeQuestion ? (
          <div className="py-4">
            <div className="mb-6 rounded-md bg-background-secondary p-4 dark:bg-dark-background">
              <h3 className="mb-2 text-lg font-medium text-text dark:text-dark-text">Current Question</h3>
              <p className="text-text dark:text-dark-text">{activeQuestion.text}</p>
            </div>
            
            {answerSubmitted ? (
              <div className="rounded-md bg-success-light/20 p-4 dark:bg-success-light/10">
                <p className="text-success-dark dark:text-success-light">
                  Your answer has been submitted! The professor may award points for good answers.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitAnswer}>
                <div className="mb-4">
                  <label htmlFor="answerText" className="mb-2 block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                    Your Answer
                  </label>
                  <textarea
                    id="answerText"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-4 py-2 text-text focus:border-primary focus:outline-none dark:border-dark-border dark:bg-dark-background-secondary dark:text-dark-text dark:focus:border-dark-primary"
                    rows={3}
                    placeholder="Type your answer here..."
                    required
                    disabled={isSubmitting || cooldownActive}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary disabled:opacity-50"
                  disabled={isSubmitting || cooldownActive}
                >
                  {isSubmitting ? 'Submitting...' : cooldownActive ? `Wait (${cooldownTime}s)` : 'Submit Answer'}
                </button>
                {answerSubmitted && (
                  <span className="ml-2 text-success-dark dark:text-success-light">
                    Answer sent!
                  </span>
                )}
              </form>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-text-secondary dark:text-dark-text-secondary">
              No active question from your professor. Please wait for a question to be asked.
            </p>
          </div>
        )}
      </div>
      
      {/* Points Counter Section */}
      <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary relative">
        <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">My Points</h2>
        
        <div className="flex flex-col items-center justify-center h-[300px]">
          <div className="text-8xl font-bold text-primary dark:text-dark-primary mb-8">
            {points}
          </div>
          
          <div className="flex items-center space-x-6">
            <button
              onClick={handleSubtractPoint}
              className="rounded-md w-12 h-12 flex items-center justify-center bg-error-light/20 text-error-dark text-2xl font-bold hover:bg-error-light/30 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20"
            >
              -
            </button>
            
            <button
              onClick={handleAddPoint}
              className="rounded-md w-12 h-12 flex items-center justify-center bg-primary text-white text-2xl font-bold hover:bg-primary-hover dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover"
            >
              +
            </button>
          </div>
          
          <p className="mt-4 text-text-secondary dark:text-dark-text-secondary">
            Total points earned
            {isSavingPoints && <span className="ml-2 text-xs italic">(saving...)</span>}
          </p>
        </div>

        {/* Set Points Button */}
        <button
          onClick={handleSetPoints}
          className="absolute bottom-6 right-6 rounded-md px-4 py-2 text-sm bg-background-secondary text-text hover:bg-background-tertiary dark:bg-dark-background-secondary dark:text-dark-text dark:hover:bg-dark-background-tertiary"
        >
          Set Points
        </button>
      </div>
    </div>
  );

  // Main component render
  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-3xl font-bold text-text dark:text-dark-text mb-4 sm:mb-0">Student Dashboard</h1>
            
            {/* Tab Switcher */}
            <div className="flex border-b border-background-tertiary dark:border-dark-background-tertiary">
              <button
                onClick={() => setActiveTab('questions')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  activeTab === 'questions'
                    ? 'border-b-2 border-primary dark:border-dark-primary text-primary dark:text-dark-primary'
                    : 'text-text-secondary dark:text-dark-text-secondary hover:text-text dark:hover:text-dark-text'
                }`}
              >
                Questions
              </button>
              <button
                onClick={() => setActiveTab('points')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  activeTab === 'points'
                    ? 'border-b-2 border-primary dark:border-dark-primary text-primary dark:text-dark-primary'
                    : 'text-text-secondary dark:text-dark-text-secondary hover:text-text dark:hover:text-dark-text'
                }`}
              >
                Points
              </button>
            </div>
          </div>
          
          {/* Loading indicator */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
              <span className="ml-2 text-text-secondary dark:text-dark-text-secondary">Loading...</span>
            </div>
          ) : null}
          
          {/* Error display */}
          {error && (
            <div className="mb-8 rounded-lg bg-error-light/20 p-6 shadow-all-around dark:bg-error-light/10">
              <h2 className="mb-2 text-lg font-semibold text-error-dark dark:text-error-light">Error</h2>
              <p className="text-error-dark dark:text-error-light">{error}</p>
            </div>
          )}
          
          {/* Render the active tab content */}
          {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
        </div>
      </main>
    </div>
  );
} 