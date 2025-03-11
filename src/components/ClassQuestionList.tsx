'use client';

import React, { useMemo } from 'react';
import { Question } from '@/types';

interface ClassQuestionListProps {
  questions: Question[];
  isLoading?: boolean;
}

const ClassQuestionList: React.FC<ClassQuestionListProps> = React.memo(({
  questions,
  isLoading = false
}) => {
  const renderLoading = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
          <span className="ml-2 text-xs sm:text-sm text-text-secondary dark:text-dark-text-secondary">Loading class questions...</span>
        </div>
      );
    }
    return null;
  }, [isLoading]);

  const renderEmptyState = useMemo(() => {
    if (questions.length === 0) {
      return (
        <div className="rounded-md bg-background-secondary p-4 sm:p-8 text-center dark:bg-dark-background-tertiary">
          <p className="text-sm sm:text-base text-text-secondary dark:text-dark-text-secondary">No questions have been asked in class yet.</p>
        </div>
      );
    }
    return null;
  }, [questions.length]);

  const questionItems = useMemo(() => {
    return questions.map((question) => (
      <li key={question.id} className="py-3 sm:py-4 border-b border-background-tertiary dark:border-dark-background-tertiary last:border-0 relative">
        {/* Status indicator */}
        <div className="absolute top-2 right-2 z-10">
          <div 
            className={`h-2 w-2 rounded-full ${
              question.status === 'answered' 
                ? 'bg-success-light dark:bg-success-dark' 
                : 'bg-error-light dark:bg-error-dark'
            }`}
            title={question.status === 'answered' ? 'Answered' : 'Unanswered'}
          ></div>
        </div>

        <div className="flex flex-col space-y-2 w-full">
          <div className="w-full">
            <div className="text-sm sm:text-base text-text dark:text-dark-text break-words whitespace-normal overflow-wrap-anywhere pr-8 pl-2">
              {question.text}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-tertiary dark:text-dark-text-tertiary">
              {new Date(question.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </li>
    ));
  }, [questions]);

  if (isLoading) return renderLoading;
  if (questions.length === 0) return renderEmptyState;

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-dark-text">Class Questions</h2>
      <ul className="divide-y divide-background-tertiary dark:divide-dark-background-tertiary rounded-md bg-white p-2 sm:p-4 dark:bg-dark-background-secondary w-full overflow-hidden">
        {questionItems}
      </ul>
    </div>
  );
});

ClassQuestionList.displayName = 'ClassQuestionList';

export default ClassQuestionList; 