'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Question } from '@/types';
import { deleteQuestion, updateQuestion, updateQuestionStatus } from '@/lib/questions';

interface QuestionListProps {
  questions: Question[];
  isProfessor?: boolean;
  isStudent?: boolean;
  studentId?: string;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

const QuestionList: React.FC<QuestionListProps> = React.memo(({
  questions,
  isProfessor = false,
  isStudent = false,
  studentId = '',
  onDelete,
  emptyMessage = "No questions yet.",
  isLoading = false
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

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

  const startEditing = useCallback((id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    if (!editText.trim()) return;
    
    setIsUpdating(true);
    
    try {
      const success = await updateQuestion(id, editText, studentId);
      if (success) {
        setEditingId(null);
        setEditText('');
      }
    } catch (error) {
      console.error('Error updating question:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [editText, studentId]);

  const toggleQuestionStatus = useCallback(async (id: string, currentStatus: 'answered' | 'unanswered' | undefined) => {
    // Default to 'unanswered' if status is undefined
    const newStatus = currentStatus === 'answered' ? 'unanswered' : 'answered';
    
    setUpdatingStatusId(id);
    
    try {
      await updateQuestionStatus(id, newStatus);
    } catch (error) {
      console.error('Error updating question status:', error);
    } finally {
      setUpdatingStatusId(null);
    }
  }, []);

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
      <li key={question.id} className="py-3 sm:py-4 border-b border-background-tertiary dark:border-dark-background-tertiary last:border-0 relative">
        {/* Status indicator */}
        <div className="absolute top-3 right-3">
          <div 
            className={`h-3 w-3 rounded-full ${
              question.status === 'answered' 
                ? 'bg-success-light dark:bg-success-dark' 
                : 'bg-error-light dark:bg-error-dark'
            }`}
            title={question.status === 'answered' ? 'Answered' : 'Unanswered'}
          ></div>
        </div>

        <div className="flex flex-col space-y-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex-1 pr-2 sm:pr-4">
            {editingId === question.id ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="form-input w-full"
                  rows={3}
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => saveEdit(question.id)}
                    disabled={isUpdating}
                    className="rounded-md px-2 py-1 text-xs font-medium bg-primary text-white hover:bg-primary-hover dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover"
                  >
                    {isUpdating ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={isUpdating}
                    className="rounded-md px-2 py-1 text-xs font-medium bg-background-secondary text-text-secondary hover:bg-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-background-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
          
          {/* Action buttons for professors or students */}
          {(isProfessor || isStudent) && editingId !== question.id && (
            <div className="flex items-center space-x-2 mt-2 sm:mt-0">
              {isProfessor && (
                <div className="flex items-center mr-2">
                  <button
                    onClick={() => toggleQuestionStatus(question.id, question.status)}
                    disabled={updatingStatusId === question.id}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      updatingStatusId === question.id
                        ? 'bg-background-tertiary dark:bg-dark-background-tertiary'
                        : question.status === 'answered'
                          ? 'bg-success-light dark:bg-success-dark'
                          : 'bg-error-light dark:bg-error-dark'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        question.status === 'answered' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="ml-2 text-xs text-text-secondary dark:text-dark-text-secondary">
                    {question.status === 'answered' ? 'Answered' : 'Unanswered'}
                  </span>
                </div>
              )}
              
              {isStudent && (
                <button
                  onClick={() => startEditing(question.id, question.text)}
                  className="rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-dark-primary-900/30 dark:text-dark-primary-300 dark:hover:bg-dark-primary-900/50"
                >
                  Edit
                </button>
              )}
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
  }, [
    questions, 
    expandedId, 
    deletingId, 
    isProfessor, 
    isStudent, 
    editingId, 
    editText, 
    isUpdating,
    updatingStatusId,
    handleDelete, 
    toggleExpand, 
    startEditing, 
    saveEdit, 
    cancelEditing,
    toggleQuestionStatus
  ]);

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