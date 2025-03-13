'use client';

import { useState, useEffect } from 'react';
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
  addAnswer
} from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { Question } from '@/types';

type TabType = 'questions' | 'points';

export default function StudentPage() {
  const router = useRouter();
  const [className, setClassName] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [classQuestions, setClassQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [points, setPoints] = useState<number>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const savedPoints = localStorage.getItem('studentPoints');
      return savedPoints ? parseInt(savedPoints, 10) : 0;
    }
    return 0;
  });
  const [pointsInput, setPointsInput] = useState<string>('0');
  
  // Active question state
  const [activeQuestion, setActiveQuestion] = useState<{id: string, text: string, timestamp: number} | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);

  useEffect(() => {
    // Save points to localStorage whenever they change
    if (typeof window !== 'undefined') {
      localStorage.setItem('studentPoints', points.toString());
      setPointsInput(points.toString());
    }
  }, [points]);

  useEffect(() => {
    // Check if user is a student
    if (!isStudent()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setStudentId(userId);

    const checkJoinedClass = async () => {
      try {
        // Check if student has already joined a class
        const joinedClass = await getJoinedClass(userId);
        
        if (joinedClass) {
          setClassName(joinedClass);
          setJoined(true);
          
          // Set up listener for student's questions
          const unsubscribePersonal = listenForUserQuestions(userId, joinedClass, (questions) => {
            setMyQuestions(questions);
            setIsLoading(false);
          });
          
          // Set up listener for all class questions
          const unsubscribeClass = listenForQuestions(joinedClass, (questions) => {
            setClassQuestions(questions);
          });
          
          // Set up listener for active question
          const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass, (question) => {
            console.log("Active question update:", question);
            
            // If the active question changes, reset the answer state
            if (question?.id !== activeQuestion?.id) {
              setAnswerText('');
              setAnswerSubmitted(false);
            }
            
            setActiveQuestion(question);
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
  }, [router, activeQuestion]);

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
        
        // Set up listener for active question
        const unsubscribeActiveQuestion = listenForActiveQuestion(joinedClass, (question) => {
          console.log("Active question update:", question);
          setActiveQuestion(question);
          setAnswerText('');
          setAnswerSubmitted(false);
        });
        
        // We don't need to return the unsubscribe function here since this isn't a useEffect
      }
    } catch (error) {
      console.error('Error after joining class:', error);
      setError('Failed to load questions. Please refresh the page.');
    }
  };

  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

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

  const handleAddPoint = () => {
    setPoints(prevPoints => prevPoints + 1);
  };

  const handleSubtractPoint = () => {
    setPoints(prevPoints => Math.max(0, prevPoints - 1));
  };

  const handlePointsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setPoints(numValue);
    }
  };

  const handleSetPoints = () => {
    const newPoints = window.prompt("Enter points:");
    if (newPoints !== null) {
      const numValue = parseInt(newPoints, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        setPoints(numValue);
      }
    }
  };
  
  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!answerText.trim() || !activeQuestion || !studentId || !className) {
      console.error("Missing required fields for submitting answer");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const answerId = await addAnswer(activeQuestion.id, answerText, studentId, className);
      
      if (answerId) {
        console.log("Answer submitted successfully with ID:", answerId);
        setAnswerSubmitted(true);
        // Remove the automatic point reward
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      setError("Failed to submit answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const renderPointsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Answer Questions Section */}
      <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
        <h2 className="mb-4 text-xl font-semibold text-text dark:text-dark-text">Answer Questions</h2>
        {!joined ? (
          <div className="py-8 text-center text-text-secondary dark:text-dark-text-secondary">
            Please join a class to answer questions and earn points
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
                  Your answer has been submitted! You earned 1 point.
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
                    disabled={isSubmitting}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Answer'}
                </button>
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
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
              <span className="ml-2 text-text-secondary dark:text-dark-text-secondary">Loading...</span>
            </div>
          ) : null}
          
          {error && (
            <div className="mb-8 rounded-lg bg-error-light/20 p-6 shadow-all-around dark:bg-error-light/10">
              <h2 className="mb-2 text-lg font-semibold text-error-dark dark:text-error-light">Error</h2>
              <p className="text-error-dark dark:text-error-light">{error}</p>
            </div>
          )}
          
          {activeTab === 'questions' ? renderQuestionsTab() : renderPointsTab()}
        </div>
      </main>
    </div>
  );
} 