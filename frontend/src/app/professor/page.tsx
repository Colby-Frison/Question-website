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

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { socketService } from '@/lib/websocket';
import type { Question as WebSocketQuestion, Answer } from '@/lib/websocket';
import Navbar from '@/components/Navbar';
import ClassNameDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useClassCode } from '@/hooks/useClassCode';

// Define tab types for the dashboard
type TabType = 'questions' | 'answers' | 'points';

// Define types for the component
interface Question {
  id: string;
  text: string;
  timestamp: number;
  studentId: string;
  status?: 'answered' | 'unanswered';
}

interface ActiveQuestion {
  id: string;
  text: string;
  timestamp: number;
}

export default function ProfessorPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  // State for class and session management
  const [className, setClassName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [questionText, setQuestionText] = useState('');

  // Points tab state
  const [pointsAwarded, setPointsAwarded] = useState<{[answerId: string]: number}>({});

  // Student count tracking
  const [studentCount, setStudentCount] = useState<number>(0);

  // Welcome message state
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('hideWelcomeProfessor');
      return savedState ? false : true;
    }
    return true;
  });

  // Load from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const storedClassName = localStorage.getItem('className');
    const storedSessionCode = localStorage.getItem('sessionCode');
    const storedSessionActive = localStorage.getItem('sessionActive');
    const storedQuestions = localStorage.getItem('questions');
    const storedAnswers = localStorage.getItem('answers');
    const storedActiveQuestion = localStorage.getItem('activeQuestion');

    if (storedClassName) setClassName(storedClassName);
    if (storedSessionCode) setSessionCode(storedSessionCode);
    if (storedSessionActive === 'true') setSessionActive(true);
    if (storedQuestions) setQuestions(JSON.parse(storedQuestions));
    if (storedAnswers) setAnswers(JSON.parse(storedAnswers));
    if (storedActiveQuestion) setActiveQuestion(JSON.parse(storedActiveQuestion));
  }, []);

  // Save to localStorage when values change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('className', className);
      localStorage.setItem('sessionCode', sessionCode);
      localStorage.setItem('sessionActive', sessionActive.toString());
      localStorage.setItem('questions', JSON.stringify(questions));
      localStorage.setItem('answers', JSON.stringify(answers));
      localStorage.setItem('activeQuestion', JSON.stringify(activeQuestion));
    }
  }, [className, sessionCode, sessionActive, questions, answers, activeQuestion, mounted]);

  // Restore session on mount
  useEffect(() => {
    if (mounted && sessionActive && sessionCode) {
      socketService.joinSession(sessionCode, user?.id || '', true);
    }
  }, [sessionActive, sessionCode, user?.id, mounted]);

  // WebSocket setup
  useEffect(() => {
    // Connect to WebSocket server
    socketService.connect();

    // Set up WebSocket listeners
    socketService.onQuestionCreated((question) => {
      // Only add student questions to the questions list
      if (!question.isProfessor) {
        setQuestions(prev => [...prev, question]);
      }
    });

    socketService.onAnswerUpdate((answer) => {
      setAnswers(prev => [...prev, answer]);
    });

    socketService.onSessionUpdate((data) => {
      setStudentCount(data.students.length);
    });

    socketService.onActiveQuestionUpdate((question) => {
      setActiveQuestion(question);
      // Clear answers when a new active question is set
      if (question) {
        setAnswers([]);
      }
    });

    // Clean up on unmount
    return () => {
      socketService.offQuestionCreated();
      socketService.offAnswerUpdate();
      socketService.offSessionUpdate();
      socketService.offActiveQuestionUpdate();
    };
  }, []);

  // Check if user is professor
  useEffect(() => {
    if (user && user.type !== 'professor') {
      router.push('/student');
    }
  }, [user, router]);

  const handleCreateSession = async () => {
    if (!className.trim()) {
      setError('Please enter a class name');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setSessionCode(code);
      
      socketService.joinSession(code, user?.id || '', true);
      
      setSessionActive(true);
      setIsLoading(false);
      } catch (error) {
      console.error('Error creating session:', error);
      setError('Failed to create session. Please try again.');
      setIsLoading(false);
    }
  };

  const handleEndQuestion = async (questionId: string) => {
    try {
      // End question through WebSocket
      socketService.endQuestion(questionId);
      setActiveQuestion(null);
    } catch (error) {
      console.error("Error ending question:", error);
      setError("Failed to end question. Please try again.");
    }
  };

  const handleAwardPoints = async (studentId: string, points: number) => {
    try {
      // Award points through WebSocket
      socketService.awardPoints(studentId, points);
    } catch (error) {
      console.error("Error awarding points:", error);
      setError("Failed to award points. Please try again.");
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim() || !sessionCode) return;
    
    try {
      const question: Omit<Question, 'id' | 'timestamp'> = {
        text: questionText,
        studentId: user?.id || '',
        studentName: 'Professor',
        isProfessor: true,
        isActive: true
      };
      
      socketService.createQuestion(question);
      setQuestionText('');
    } catch (error) {
      console.error('Error asking question:', error);
      setError('Failed to create question. Please try again.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleToggleQuestionStatus = async (id: string, newStatus: 'answered' | 'unanswered') => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: newStatus } : q));
  };

  const handleClassNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClassName(e.target.value);
        setError(null);
  };

  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

  const handleCloseWelcome = useCallback(() => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideWelcomeProfessor', 'true');
    }
  }, []);

  const resetWelcomeMessage = useCallback(() => {
    setShowWelcome(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hideWelcomeProfessor');
    }
  }, []);

  // Only render content after mount to avoid hydration mismatch
  if (!mounted) {
    return null;
  }
    
    return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-6">
        {!sessionActive ? (
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Start Class Session</h1>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleCreateSession();
            }} className="space-y-4">
    <div>
                <label htmlFor="className" className="block text-sm font-medium mb-1">
                  Class Name
                </label>
            <input
              type="text"
                  id="className"
                  name="className"
                  value={className}
                  onChange={handleClassNameChange}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Enter class name"
                required
              />
              </div>
            <button
              type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                disabled={isLoading || !className.trim()}
            >
                {isLoading ? 'Starting...' : 'Start Session'}
            </button>
          </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
          <div>
                <h1 className="text-2xl font-bold">{className}</h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Session Code: {sessionCode}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  Students Joined: {studentCount}
                </p>
        </div>
              <button
                onClick={() => handleEndQuestion(activeQuestion?.id || '')}
                className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
              >
                End Session
              </button>
      </div>
      
            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                          <button
                  onClick={() => setActiveTab('questions')}
                  className={`${
                    activeTab === 'questions'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Questions
                          </button>
                <button
                  onClick={() => setActiveTab('answers')}
                  className={`${
                    activeTab === 'answers'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Answers
                </button>
                <button
                  onClick={() => setActiveTab('points')}
                  className={`${
                    activeTab === 'points'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Points
                </button>
              </nav>
                      </div>
                      
            {/* Questions Tab */}
            {activeTab === 'questions' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Student Questions</h2>
                  {questions.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">
                      No questions yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {questions.map((question) => (
                        <div
                          key={question.id}
                          className="p-4 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {new Date(question.timestamp).toLocaleTimeString()}
                              </p>
                              <p className="mt-1">{question.text}</p>
                </div>
                            <div className="flex space-x-2">
                            <button
                                onClick={() => handleToggleQuestionStatus(question.id, 'answered')}
                                className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                              >
                                Mark as Answered
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(question.id)}
                                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              >
                                Delete
                            </button>
                      </div>
                    </div>
      </div>
                      ))}
        </div>
                  )}
      </div>
                  </div>
                )}

            {/* Answers Tab */}
            {activeTab === 'answers' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Active Question</h2>
                  <form onSubmit={handleAskQuestion} className="space-y-4">
                    <textarea
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                      placeholder="Type your answer here..."
                      rows={3}
                      />
                  <button
                      type="submit"
                      className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                      >
                      Submit Answer
                      </button>
                  </form>

                  {activeQuestion && (
                    <div className="space-y-4">
                      <div className="p-4 border rounded-md dark:bg-gray-800 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(activeQuestion.timestamp).toLocaleTimeString()}
                        </p>
                        <p className="mt-1">{activeQuestion.text}</p>
                  </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Student Answers</h3>
                        {answers.length === 0 ? (
                          <p className="text-gray-500 dark:text-gray-400">
                            No answers yet.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {answers.map((answer) => (
                              <div
                                key={answer.id}
                                className="p-4 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                              >
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {new Date(answer.timestamp).toLocaleTimeString()}
                                </p>
                                <p className="mt-1">{answer.text}</p>
                                <div className="mt-2 flex items-center space-x-4">
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={pointsAwarded[answer.id] || 0}
                                    onChange={(e) => {
                                      const points = parseInt(e.target.value);
                                      setPointsAwarded(prev => ({
                                        ...prev,
                                        [answer.id]: points
                                      }));
                                    }}
                                    className="w-20 px-2 py-1 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                                    placeholder="Points"
                                  />
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    points
                                  </span>
                        </div>
                          </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            )}

            {/* Points Tab */}
            {activeTab === 'points' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Student Points</h2>
                  <div className="space-y-2">
                    {questions.map((question) => (
                      <div
                        key={question.id}
                        className="flex justify-between items-center bg-gray-50 rounded-lg p-4"
                      >
                        <span>Student {question.studentId}</span>
                        <div className="flex space-x-2">
                      <button
                            onClick={() => handleAwardPoints(question.studentId, 1)}
                            className="text-green-600 hover:text-green-800"
                          >
                            +1
                      </button>
                      <button
                            onClick={() => handleAwardPoints(question.studentId, -1)}
                            className="text-red-600 hover:text-red-800"
                          >
                            -1
                      </button>
                    </div>
                  </div>
                    ))}
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 