'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JoinClass from '@/components/JoinClass';
import QuestionForm from '@/components/QuestionForm';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isStudent, getUserId } from '@/lib/auth';
import { listenForUserQuestions } from '@/lib/questions';
import { getJoinedClass, leaveClass } from '@/lib/classCode';
import { Question } from '@/types';

export default function StudentPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState('');

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
          setClassCode(joinedClass);
          setJoined(true);
          
          // Set up listener for student's questions
          const unsubscribe = listenForUserQuestions(userId, joinedClass, (questions) => {
            setMyQuestions(questions);
            setIsLoading(false);
          });
          
          return () => {
            unsubscribe();
          };
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking joined class:', error);
        setIsLoading(false);
      }
    };

    checkJoinedClass();
  }, [router]);

  const handleJoinSuccess = async () => {
    try {
      // Refresh the joined class
      const joinedClass = await getJoinedClass(studentId);
      
      if (joinedClass) {
        setClassCode(joinedClass);
        setJoined(true);
        
        // Set up listener for student's questions
        listenForUserQuestions(studentId, joinedClass, (questions) => {
          setMyQuestions(questions);
          setIsLoading(false);
        });
      }
    } catch (error) {
      console.error('Error handling join success:', error);
    }
  };

  const handleLogout = () => {
    clearUserType();
  };

  const handleLeaveClass = async () => {
    try {
      await leaveClass(studentId);
      setJoined(false);
      setClassCode('');
      setMyQuestions([]);
    } catch (error) {
      console.error('Error leaving class:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userType="student" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        </div>

        {!joined ? (
          <JoinClass onJoin={handleJoinSuccess} studentId={studentId} />
        ) : (
          <>
            <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">Current Class</h2>
                  <div className="mt-2 rounded-md bg-gray-100 px-4 py-2 font-mono font-bold">
                    {classCode}
                  </div>
                </div>
                <button
                  onClick={handleLeaveClass}
                  className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Leave Class
                </button>
              </div>
            </div>

            <div className="mb-8">
              <QuestionForm userIdentifier={studentId} classCode={classCode} />
            </div>

            <div className="rounded-lg bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">My Questions</h2>
              <QuestionList 
                questions={myQuestions} 
                emptyMessage="You haven't asked any questions yet."
                isLoading={isLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
} 