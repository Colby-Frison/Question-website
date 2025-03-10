'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Question } from '@/types';
import { deleteQuestion } from '@/lib/questions';

interface QuestionListProps {
  questions: Question[];
  isProfessor?: boolean;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

const QuestionList: React.FC<QuestionListProps> = React.memo(({
  questions,
  isProfessor = false,
  onDelete,
  emptyMessage = "No questions yet.",
  isLoading = false
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = useCallback(async (id: string) => {
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
  }, [onDelete]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(expandedId === id ? null : id);
  }, [expandedId]);

  const renderLoading = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
          <span className="ml-2 text-xs sm:text-sm text-text-secondary dark:text-dark-text-secondary">Loading questions...</span>
        </div>
      );
    }
    return null;
  }, [isLoading]);

  const renderEmptyState = useMemo(() => {
    if (questions.length === 0) {
      return (
        <div className="rounded-md bg-background-secondary p-4 sm:p-8 text-center dark:bg-dark-background-tertiary">
          <p className="text-sm sm:text-base text-text-secondary dark:text-dark-text-secondary">{emptyMessage}</p>
        </div>
      );
    }
    return null;
  }, [questions.length, emptyMessage]);

  const questionItems = useMemo(() => {
    return questions.map((question) => (
      <li key={question.id} className="py-3 sm:py-4 border-b border-background-tertiary dark:border-dark-background-tertiary last:border-0">
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex-1 pr-2 sm:pr-4">
            <div 
              className={`text-sm sm:text-base text-text dark:text-dark-text ${
                question.text.length > 150 && expandedId !== question.id ? 'line-clamp-3' : ''
              }`}
            >
              {question.text}
            </div>
            {question.text.length > 150 && (
              <button 
                onClick={() => toggleExpand(question.id)}
                className="mt-1 text-xs font-medium text-primary hover:text-primary-hover dark:text-dark-primary dark:hover:text-dark-primary-hover"
              >
                {expandedId === question.id ? 'Show less' : 'Show more'}
              </button>
            )}
            <p className="mt-1 text-xs text-text-tertiary dark:text-dark-text-tertiary">
              {new Date(question.timestamp).toLocaleString()}
            </p>
          </div>
          {isProfessor && (
            <div className="flex items-center space-x-2 mt-2 sm:mt-0">
              <button
                onClick={() => handleDelete(question.id)}
                disabled={deletingId === question.id}
                className={`rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors ${
                  deletingId === question.id
                    ? 'bg-background-tertiary text-text-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-tertiary'
                    : 'bg-error-light/20 text-error-dark hover:bg-error-light/30 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20'
                }`}
              >
                {deletingId === question.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </li>
    ));
  }, [questions, expandedId, deletingId, isProfessor, handleDelete, toggleExpand]);

  if (isLoading) return renderLoading;
  if (questions.length === 0) return renderEmptyState;

  return (
    <ul className="divide-y divide-background-tertiary dark:divide-dark-background-tertiary rounded-md bg-white p-2 sm:p-4 dark:bg-dark-background-secondary">
      {questionItems}
    </ul>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList; 