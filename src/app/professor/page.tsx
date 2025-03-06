'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ClassCodeDisplay from '@/components/ClassCodeDisplay';
import QuestionList from '@/components/QuestionList';
import { logout, getCurrentUser, isProfessor } from '@/lib/auth';
import { getQuestions } from '@/lib/questions';
import { generateClassCode, getClassCode, setClassCode } from '@/lib/classCode';
import { Question } from '@/types';

export default function ProfessorPage() {
  const router = useRouter();
  const [classCode, setClassCodeState] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [user, setUser] = useState<{ email: string; userType: string } | null>(null);

  useEffect(() => {
    // Check if user is logged in and is a professor
    if (!isProfessor()) {
      router.push('/');
      return;
    }

    setUser(getCurrentUser());

    // Generate a random class code if none exists
    const existingCode = getClassCode();
    if (existingCode) {
      setClassCodeState(existingCode);
    } else {
      const newCode = generateClassCode();
      setClassCodeState(newCode);
      setClassCode(newCode);
    }

    // Load questions from localStorage
    loadQuestions();

    // Set up interval to check for new questions
    const interval = setInterval(loadQuestions, 5000);

    return () => clearInterval(interval);
  }, [router]);

  const loadQuestions = () => {
    setQuestions(getQuestions());
  };

  const handleDeleteQuestion = (id: string) => {
    const updatedQuestions = questions.filter(q => q.id !== id);
    setQuestions(updatedQuestions);
    localStorage.setItem('questions', JSON.stringify(updatedQuestions));
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Professor Dashboard</h1>
        </div>

        <div className="mb-8">
          <ClassCodeDisplay classCode={classCode} />
        </div>

        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-800">Student Questions</h2>
          <QuestionList 
            questions={questions} 
            isProfessor={true} 
            onDelete={handleDeleteQuestion}
            emptyMessage="No questions yet. Waiting for students to ask questions."
          />
        </div>
      </div>
    </div>
  );
} 