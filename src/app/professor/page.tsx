'use client';

/**
 * Professor Dashboard Page
 * 
 * This component serves as the main dashboard for professors, allowing them to:
 * - View and manage student questions
 * - Create and manage active questions for students to answer
 * - Award points to students for their answers
 * - Switch between questions and points tabs
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
  runDatabaseMaintenance
} from '@/lib/questions';
import { getClassForProfessor } from '@/lib/classCode';
import { checkFirebaseConnection } from '@/lib/firebase';
import { createClassSession } from '@/lib/classSession';
import { Question } from '@/types';
import { setupAutomaticMaintenance } from '@/lib/maintenance';

// Define tab types for the dashboard
type TabType = 'questions' | 'points';

export default function ProfessorPage() {
  const router = useRouter();
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  // Tab state to switch between questions and points views
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  
  // Points tab state for managing active questions and student answers
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{id: string, text: string, timestamp: number, studentId: string, questionText?: string, activeQuestionId?: string}[]>([]);
  const [pointsAwarded, setPointsAwarded] = useState<{[answerId: string]: number}>({});
  const [maintenanceSetup, setMaintenanceSetup] = useState(false);

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
      
      // Create a session ID if we don't have one
      if (!sessionId && existingClassName) {
        try {
          const newSessionId = await createClassSession(existingClassName, userId);
          setSessionId(newSessionId);
          console.log("Created new session ID:", newSessionId);
        } catch (err) {
          console.error("Error creating session:", err);
          // Use a fallback session ID if creation fails
          setSessionId('fallback-session-id');
        }
      }
      
      // Start listening for questions if we have a class name
      if (existingClassName) {
        const unsubscribe = listenForQuestions(existingClassName, (newQuestions) => {
          setQuestions(newQuestions);
          setIsLoading(false);
        });
        
        // Cleanup function
        return () => {
          unsubscribe();
        };
      } else {
        // No class yet, just stop loading
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error initializing class:", error);
      setError("Failed to initialize class. Please refresh the page.");
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
      await deleteQuestion(id);
      // The questions list will update automatically via the listener
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  /**
   * Handle changing the class name
   * Updates state and sets up new listeners for the new class
   * 
   * @param newClassName - The new class name
   */
  const handleClassNameChange = (newClassName: string) => {
    setClassName(newClassName);
    
    // Start listening for questions with the new class name
    if (newClassName) {
      const unsubscribe = listenForQuestions(newClassName, (newQuestions) => {
        setQuestions(newQuestions);
      });
      
      // We don't need to return the unsubscribe function here since this isn't a useEffect
      // The old listener will be replaced when this function is called again
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
  };
  
  /**
   * Handle asking a new question to students
   * Creates a new active question and clears previous answers
   * 
   * @param e - Form submit event
   */
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim() || !professorId || !className) {
      console.error("Missing required fields for asking a question");
      return;
    }
    
    // Immediately update UI to show the new question
    const tempQuestionId = `temp-${Date.now()}`;
    setActiveQuestionId(tempQuestionId);
    setAnswers([]); // Clear answers immediately
    
    try {
      const newQuestionId = await addActiveQuestion(questionText, professorId, className);
      if (newQuestionId) {
        console.log("New active question created with ID:", newQuestionId);
        setActiveQuestionId(newQuestionId);
      }
    } catch (error) {
      console.error("Error asking question:", error);
      // If there's an error, we keep the temp ID so at least the UI shows something
    }
  };
  
  /**
   * Handle awarding points to a student for their answer
   * If the same point value is clicked again, it deselects (sets to 0)
   * 
   * @param studentId - The ID of the student to award points to
   * @param points - The number of points to award
   * @param answerId - The ID of the answer being awarded points
   */
  const handleRewardPoints = async (studentId: string, points: number, answerId: string) => {
    try {
      // Check if points were already awarded to this answer
      const previousPoints = pointsAwarded[answerId] || 0;
      
      // If clicking the same point value again, deselect it (set to 0)
      const newPoints = previousPoints === points ? 0 : points;
      const pointsDifference = newPoints - previousPoints;
      
      // Immediately update UI to show points were awarded or deselected
      setPointsAwarded(prev => ({
        ...prev,
        [answerId]: newPoints
      }));
      
      // Only update if there's a change in points
      if (pointsDifference !== 0) {
        // Update database in the background
        updateStudentPoints(studentId, pointsDifference)
          .then(() => {
            console.log(`Adjusted points for student ${studentId}: ${pointsDifference} points (new total: ${newPoints})`);
          })
          .catch((error) => {
            console.error("Error awarding points:", error);
            // Revert UI if database update fails
            setPointsAwarded(prev => ({
              ...prev,
              [answerId]: previousPoints
            }));
            setError("Failed to award points. Please try again.");
          });
      }
    } catch (error) {
      console.error("Error in handleRewardPoints:", error);
      setError("Failed to award points. Please try again.");
    }
  };
  
  /**
   * Render the Questions tab content
   * Shows a list of student questions with options to delete them
   */
  const renderQuestionsTab = () => (
    <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
      <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Questions</h2>
      <QuestionList 
        questions={questions} 
        isProfessor={true}
        onDelete={handleDeleteQuestion}
        emptyMessage="No questions yet. Share your class name with students to get started."
        isLoading={isLoading}
      />
    </div>
  );
  
  /**
   * Render the Points tab content
   * Shows the current class, allows asking questions, and displays student answers
   * with options to award points
   */
  const renderPointsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left container - Class Name and Ask Question */}
      <div className="flex flex-col space-y-6">
        {/* Class Name Display - Moved from outside the tab */}
        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text dark:text-dark-text">Current Class</h2>
              <p className="mt-1 text-text-secondary dark:text-dark-text-secondary">
                {className}
              </p>
            </div>
          </div>
        </div>
        
        {/* Ask Question */}
        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
          <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Ask Students a Question</h2>
          
          <form onSubmit={handleAskQuestion}>
            <div className="mb-4">
              <label htmlFor="questionText" className="mb-2 block text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
                Question Text
              </label>
              <textarea
                id="questionText"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-4 py-2 text-text focus:border-primary focus:outline-none dark:border-dark-border dark:bg-dark-background-secondary dark:text-dark-text dark:focus:border-dark-primary"
                rows={3}
                placeholder="Type your question here..."
                required
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary"
            >
              Ask Question
            </button>
          </form>
        </div>
      </div>
      
      {/* Right container - Current Question and Student Answers */}
      <div className="flex flex-col space-y-6">
        {/* Current Question - Displayed above student answers */}
        {activeQuestionId && (
          <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
            <h3 className="mb-2 text-lg font-medium text-text dark:text-dark-text">Current Question</h3>
            <div className="rounded-md bg-background-secondary p-4 dark:bg-dark-background">
              {answers.length > 0 && (
                <div className="mb-2 text-xs text-text-secondary dark:text-dark-text-secondary">
                  {answers.length} {answers.length === 1 ? 'answer' : 'answers'} received
                </div>
              )}
              <p className="text-text dark:text-dark-text">
                {answers.length > 0 && answers[0].questionText ? answers[0].questionText : questionText}
              </p>
            </div>
          </div>
        )}
        
        {/* Student Answers */}
        <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary flex-1">
          <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Student Answers</h2>
          
          {activeQuestionId ? (
            answers.length > 0 ? (
              <ul className="space-y-4">
                {answers.map((answer) => (
                  <li key={answer.id} className="rounded-md bg-background-secondary p-4 dark:bg-dark-background relative">
                    <p className="text-text dark:text-dark-text">{answer.text}</p>
                    <p className="mt-1 text-xs text-text-secondary dark:text-dark-text-secondary">
                      Student ID: {answer.studentId.substring(0, 8)}...
                    </p>
                    
                    {/* Point reward component - redesigned as a row of buttons */}
                    <div className="absolute bottom-4 right-4">
                      <div className="flex rounded-md overflow-hidden border border-border dark:border-dark-border">
                        {[1, 2, 3, 4, 5].map((pointValue) => {
                          const isSelected = pointsAwarded[answer.id] >= pointValue;
                          const isCurrentValue = pointsAwarded[answer.id] === pointValue;
                          return (
                            <button
                              key={pointValue}
                              onClick={() => handleRewardPoints(answer.studentId, pointValue, answer.id)}
                              className={`
                                w-8 h-8 flex items-center justify-center text-sm font-medium transition-colors
                                ${isSelected 
                                  ? isCurrentValue 
                                    ? 'bg-primary text-white dark:bg-dark-primary dark:text-dark-text' 
                                    : 'bg-primary/80 text-white dark:bg-dark-primary/80 dark:text-dark-text'
                                  : 'bg-background-secondary hover:bg-background-tertiary text-text dark:bg-dark-background-secondary dark:text-dark-text dark:hover:bg-dark-background-tertiary'
                                }
                                ${pointValue > 1 ? 'border-l border-border/30 dark:border-dark-border/30' : ''}
                              `}
                              aria-label={`Award ${pointValue} point${pointValue > 1 ? 's' : ''}`}
                            >
                              {pointValue}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-secondary dark:text-dark-text-secondary">No answers yet.</p>
            )
          ) : (
            <p className="text-text-secondary dark:text-dark-text-secondary">Ask a question to see student answers.</p>
          )}
        </div>
      </div>
    </div>
  );

  // Main component render
  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-3xl font-bold text-text dark:text-dark-text mb-4 sm:mb-0">Professor Dashboard</h1>
            
            <div className="flex items-center space-x-4">
              {/* Tab Switcher */}
              <div className="flex border-b border-background-tertiary dark:border-dark-background-tertiary">
                <button
                  onClick={() => handleTabChange('questions')}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === 'questions'
                      ? 'border-b-2 border-primary dark:border-dark-primary text-primary dark:text-dark-primary'
                      : 'text-text-secondary dark:text-dark-text-secondary hover:text-text dark:hover:text-dark-text'
                  }`}
                >
                  Questions
                </button>
                <button
                  onClick={() => handleTabChange('points')}
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
            <button 
              onClick={handleRetry}
                className="mt-4 rounded-md bg-error-dark px-4 py-2 text-sm font-medium text-white hover:bg-error-dark/90 dark:bg-error-light dark:text-error-dark dark:hover:bg-error-light/90"
            >
              Retry Connection
            </button>
          </div>
        )}

          {/* Class name display (only shown in questions tab) */}
          {className && activeTab === 'questions' && (
        <div className="mb-8">
              <ClassNameDisplay 
                className={className} 
            professorId={professorId}
                sessionId={sessionId || 'fallback-session-id'}
                onClassNameChange={handleClassNameChange}
          />
        </div>
          )}

          {/* Render the active tab content */}
          {className && (
            activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()
          )}
        </div>
      </main>
    </div>
  );
} 