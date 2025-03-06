'use client';

import { useState } from 'react';
import { Question } from '@/types';
import { deleteQuestion } from '@/lib/questions';

interface QuestionListProps {
  questions: Question[];
  isProfessor?: boolean;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

export default function QuestionList({
  questions,
  isProfessor = false,
  onDelete,
  emptyMessage = "No questions yet.",
  isLoading = false
}: QuestionListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    
    try {
      if (onDelete) {
        await onDelete(id);
      } else {
        await deleteQuestion(id);
      }
    } catch (error) {
      console.error('Error deleting question:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        <span className="ml-2 text-gray-500">Loading questions...</span>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 p-8 text-center">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {questions.map((question) => (
        <li key={question.id} className="py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-800">{question.text}</p>
              <p className="text-xs text-gray-500">
                {new Date(question.timestamp).toLocaleString()}
              </p>
            </div>
            {isProfessor && (
              <button
                onClick={() => handleDelete(question.id)}
                disabled={deletingId === question.id}
                className={`ml-4 rounded-md px-3 py-1 text-xs font-medium ${
                  deletingId === question.id
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {deletingId === question.id ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
} 