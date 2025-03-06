'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ClassCodeDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { listenForQuestions, deleteQuestion } from '@/lib/questions';
import { generateClassCode, getClassCodeForProfessor, createClassCode } from '@/lib/classCode';
import { Question } from '@/types';

export default function ProfessorPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [professorId, setProfessorId] = useState('');

  useEffect(() => {
    // Check if user is a professor
    if (!isProfessor()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setProfessorId(userId);

    const initializeClassCode = async () => {
      try {
        // Get existing class code for this professor
        let code = await getClassCodeForProfessor(userId);
        
        // If no code exists, create one
        if (!code) {
          code = generateClassCode();
          await createClassCode(code, userId);
        }
        
        setClassCode(code);
        
        // Set up listener for questions
        const unsubscribe = listenForQuestions(code, (newQuestions) => {
          setQuestions(newQuestions);
          setIsLoading(false);
        });
        
        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing class code:', error);
        setIsLoading(false);
      }
    };

    initializeClassCode();
  }, [router]);

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteQuestion(id);
      // The listener will automatically update the questions list
    } catch (error) {
      console.error('Error deleting question:', error);
    }
  };

  const handleClassCodeChange = (newCode: string) => {
    setClassCode(newCode);
  };

  const handleLogout = () => {
    clearUserType();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Professor Dashboard</h1>
        </div>

        <div className="mb-8">
          <ClassCodeDisplay 
            classCode={classCode} 
            professorId={professorId}
            onCodeChange={handleClassCodeChange}
          />
        </div>

        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-800">Student Questions</h2>
          <QuestionList 
            questions={questions} 
            isProfessor={true} 
            onDelete={handleDeleteQuestion}
            emptyMessage="No questions yet. Waiting for students to ask questions."
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
} 