'use client';

import { Question } from '@/types';
import { deleteQuestion } from '@/lib/questions';

interface QuestionListProps {
  questions: Question[];
  isProfessor?: boolean;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

export default function QuestionList({
  questions,
  isProfessor = false,
  onDelete,
  emptyMessage = "No questions yet."
}: QuestionListProps) {
  const handleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
    } else {
      deleteQuestion(id);
    }
  };

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
                className="ml-4 rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
              >
                Delete
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
} 