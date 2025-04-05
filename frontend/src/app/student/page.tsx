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
 * The page handles real-time updates through WebSocket listeners and
 * manages the student's class session and points.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { socketService } from '@/lib/websocket';
import type { Question, Answer } from '@/lib/websocket';
import Navbar from '@/components/Navbar';
import { clearUserType, isStudent, getUserId } from '@/lib/auth';

export default function StudentPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  
  // State for session management
  const [sessionCode, setSessionCode] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [questionText, setQuestionText] = useState('');
  const [studentQuestions, setStudentQuestions] = useState<Question[]>([]);

  // Load from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const storedSessionCode = localStorage.getItem('sessionCode');
    const storedSessionActive = localStorage.getItem('sessionActive');
    const storedQuestions = localStorage.getItem('questions');
    const storedAnswers = localStorage.getItem('answers');
    const storedActiveQuestion = localStorage.getItem('activeQuestion');
    const storedStudentQuestions = localStorage.getItem('studentQuestions');

    if (storedSessionCode) setSessionCode(storedSessionCode);
    if (storedSessionActive === 'true') setSessionActive(true);
    if (storedQuestions) setQuestions(JSON.parse(storedQuestions));
    if (storedAnswers) setAnswers(JSON.parse(storedAnswers));
    if (storedActiveQuestion) setActiveQuestion(JSON.parse(storedActiveQuestion));
    if (storedStudentQuestions) setStudentQuestions(JSON.parse(storedStudentQuestions));
  }, []);

  // Save to localStorage when values change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('sessionCode', sessionCode);
      localStorage.setItem('sessionActive', sessionActive.toString());
      localStorage.setItem('questions', JSON.stringify(questions));
      localStorage.setItem('answers', JSON.stringify(answers));
      localStorage.setItem('activeQuestion', JSON.stringify(activeQuestion));
      localStorage.setItem('studentQuestions', JSON.stringify(studentQuestions));
    }
  }, [sessionCode, sessionActive, questions, answers, activeQuestion, studentQuestions, mounted]);

  // WebSocket setup
  useEffect(() => {
    if (!mounted) return;

    // Connect to WebSocket server if session is active
    if (sessionActive) {
      socketService.connect();
    }

    // Set up WebSocket listeners
    socketService.onQuestionCreated((question) => {
      console.log('Received question:', question);
      // Only add student questions to the questions list
      if (!question.isProfessor) {
        setQuestions(prev => {
          // Check if question already exists to prevent duplicates
          const exists = prev.some(q => q.id === question.id);
          if (!exists) {
            const newQuestions = [...prev, question];
            // Update local storage
            localStorage.setItem('questions', JSON.stringify(newQuestions));
            return newQuestions;
          }
          return prev;
        });
      }
    });

    socketService.onQuestionDeleted((questionId) => {
      console.log('Question deleted:', questionId);
      // Remove the deleted question from the list
      setQuestions(prev => {
        const newQuestions = prev.filter(q => q.id !== questionId);
        // Update local storage
        localStorage.setItem('questions', JSON.stringify(newQuestions));
        return newQuestions;
      });
    });

    socketService.onActiveQuestionUpdate((question) => {
      console.log('Active question update:', question);
      setActiveQuestion(question);
      // Clear answers when a new active question is set
      if (question) {
        setAnswers([]);
        localStorage.setItem('answers', JSON.stringify([]));
      }
    });

    socketService.onAnswerUpdate((answer) => {
      console.log('Received answer:', answer);
      setAnswers(prev => {
        // Check if answer already exists to prevent duplicates
        const exists = prev.some(a => a.id === answer.id);
        if (!exists) {
          const newAnswers = [...prev, answer];
          // Update local storage
          localStorage.setItem('answers', JSON.stringify(newAnswers));
          return newAnswers;
        }
        return prev;
      });
    });

    socketService.onQuestionEnded((questionId) => {
      console.log('Question ended:', questionId);
      if (activeQuestion?.id === questionId) {
        setActiveQuestion(null);
        setAnswers([]);
        localStorage.setItem('answers', JSON.stringify([]));
      }
    });

    socketService.onSessionUpdate((data) => {
      console.log('Session update:', data);
      // Update questions list with all questions from the session
      if (data.questions) {
        // Filter out professor questions and ensure unique IDs
        const studentQuestions = data.questions
          .filter(q => !q.isProfessor)
          .reduce((unique, q) => {
            if (!unique.some(uq => uq.id === q.id)) {
              unique.push(q);
            }
            return unique;
          }, [] as Question[]);
        setQuestions(studentQuestions);
        // Update local storage
        localStorage.setItem('questions', JSON.stringify(studentQuestions));
      }
      // Update active question
      if (data.activeQuestion) {
        setActiveQuestion(data.activeQuestion);
      }
    });

    // Clean up on unmount
    return () => {
      socketService.offQuestionCreated();
      socketService.offQuestionDeleted();
      socketService.offActiveQuestionUpdate();
      socketService.offAnswerUpdate();
      socketService.offQuestionEnded();
      socketService.offSessionUpdate();
    };
  }, [mounted, sessionActive, activeQuestion]);

  // Verify questions against professor's list on mount and session updates
  useEffect(() => {
    if (sessionActive && sessionCode) {
      // Request current session state from professor
      socketService.joinSession(sessionCode, user?.id || '', false);
      
      // Clean up any questions that might be in local storage but not in the session
      const storedQuestions = localStorage.getItem('questions');
      if (storedQuestions) {
        const parsedQuestions = JSON.parse(storedQuestions);
        // Only keep questions that are in the current session
        const validQuestions = parsedQuestions.filter((q: Question) => 
          !q.isProfessor && !q.isDeleted
        );
        setQuestions(validQuestions);
        localStorage.setItem('questions', JSON.stringify(validQuestions));
      }
    }
  }, [sessionActive, sessionCode, user?.id]);

  // Restore session on mount
  useEffect(() => {
    if (mounted && sessionActive && sessionCode) {
      socketService.joinSession(sessionCode, user?.id || '', false);
    }
  }, [sessionActive, sessionCode, user?.id, mounted]);

  // Check if user is student
  useEffect(() => {
    if (user && user.type !== 'student') {
      router.push('/professor');
    }
  }, [user, router]);

  useEffect(() => {
    if (!isStudent()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    if (userId) {
    setStudentId(userId);
    setIsLoading(false);
    }
  }, [router]);

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // Join the session
      socketService.joinSession(sessionCode, user?.id || '', false);
      
      // Set session as active
      setSessionActive(true);
      
      // Connect to WebSocket if not already connected
      if (!socketService.isConnected()) {
        socketService.connect();
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error joining session:', error);
      setError('Failed to join session. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!answerText.trim() || !activeQuestion) return;
    
    try {
      const answer: Omit<Answer, 'id' | 'timestamp'> = {
        questionId: activeQuestion.id,
        text: answerText,
        studentId: user?.id || '',
        studentName: user?.name || 'Anonymous'
      };
      
      socketService.createAnswer(answer);
        setAnswerText('');
    } catch (error) {
      console.error('Error submitting answer:', error);
      setError('Failed to submit answer. Please try again.');
    }
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim() || !sessionCode) return;
    
    try {
      const question: Omit<Question, 'id' | 'timestamp'> = {
        text: questionText,
        studentId: user?.id || '',
        studentName: user?.name || 'Anonymous',
        isProfessor: false,
        isActive: false,
        isDeleted: false
      };
      
      socketService.createQuestion(question);
      setQuestionText('');
    } catch (error) {
      console.error('Error submitting question:', error);
      setError('Failed to submit question. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();
    clearUserType();
    router.push('/');
  };

  // Filter out deleted questions when rendering
  const nonDeletedQuestions = questions.filter(q => !q.isDeleted);

  // Only render content after mount to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

    return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-6">
        {!sessionActive ? (
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Join Class Session</h1>
            <form onSubmit={handleJoinSession} className="space-y-4">
    <div>
                <label htmlFor="sessionCode" className="block text-sm font-medium mb-1">
                  Session Code
                </label>
              <input
                type="text"
                  id="sessionCode"
                  name="sessionCode"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Enter session code"
                  required
              />
            </div>
                <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                disabled={isLoading || !sessionCode.trim()}
              >
                {isLoading ? 'Joining...' : 'Join Session'}
                </button>
            </form>
            </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">Active Session</h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Session Code: {sessionCode}
                </p>
            </div>
          </div>

            {/* Current Question Section */}
        {activeQuestion ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Current Question</h2>
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <p className="text-gray-700 dark:text-gray-300">{activeQuestion.text}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Asked by Professor at {new Date(activeQuestion.timestamp).toLocaleTimeString()}
                  </p>
            </div>
            
                <form onSubmit={handleSubmitAnswer} className="space-y-4">
                  <div>
                    <label htmlFor="answer" className="block text-sm font-medium mb-1">
                      Your Answer
                    </label>
                          <textarea
                      id="answer"
                      name="answer"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Type your answer here..."
                      rows={3}
                  required
                />
                  </div>
                <button
                  type="submit"
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    disabled={!answerText.trim()}
                >
                    Submit Answer
                </button>
              </form>

                {/* Answers Section */}
            {answers.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Class Answers</h3>
                  {answers.map((answer) => (
                    <div 
                      key={answer.id} 
                        className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"
                      >
                        <p className="text-gray-700 dark:text-gray-300">{answer.text}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          Answered by {answer.studentName} at {new Date(answer.timestamp).toLocaleTimeString()}
                          {answer.points !== undefined && (
                            <span className="ml-2 text-green-600 dark:text-green-400">
                              Points: {answer.points}
                            </span>
                          )}
                        </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  Waiting for the professor to start a question...
                </p>
        </div>
      )}

            {/* Class Questions Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Class Questions</h2>
              <form onSubmit={handleSubmitQuestion} className="space-y-4">
                <div>
                  <label htmlFor="question" className="block text-sm font-medium mb-1">
                    Ask a Question
                      </label>
                  <textarea
                    id="question"
                    name="question"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                    placeholder="Type your question here..."
                    rows={3}
                    required
                  />
                        </div>
                    <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                  disabled={!questionText.trim()}
                >
                  Submit Question
                    </button>
              </form>

              {nonDeletedQuestions.length > 0 ? (
                <div className="space-y-4">
                  {nonDeletedQuestions.map((question) => (
                    <div
                      key={question.id}
                      className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"
                    >
                      <p className="text-gray-700 dark:text-gray-300">{question.text}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        Asked by {question.studentName} at {new Date(question.timestamp).toLocaleTimeString()}
                      </p>
                            </div>
                  ))}
                    </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  No questions have been asked yet.
                </p>
              )}
            </div>
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