'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Question } from '@/types';
import { deleteQuestion, updateQuestion, updateQuestionStatus } from '@/lib/questions';

/**
 * Interface for QuestionList component props
 * @interface QuestionListProps
 * @property {Question[]} questions - Array of question objects to display
 * @property {boolean} [isProfessor] - Whether the current user is a professor
 * @property {boolean} [isStudent] - Whether the current user is a student
 * @property {string} [studentId] - ID of the current student, if applicable
 * @property {function} [onDelete] - Optional callback for when a question is deleted
 * @property {function} [onToggleStatus] - Optional callback for toggling a question's status
 * @property {string} [emptyMessage] - Message to display when there are no questions
 * @property {boolean} [isLoading] - Whether questions are currently loading
 */
interface QuestionListProps {
  questions: Question[];
  isProfessor: boolean;
  isStudent?: boolean;
  studentId?: string;
  emptyMessage?: string;
  onDelete?: (questionId: string) => void;
  onToggleStatus?: (questionId: string, currentStatus: 'answered' | 'unanswered') => void;
}

/**
 * Component for displaying a list of questions with different functionality based on user role
 * 
 * This component provides:
 * - Different views and actions for professors and students
 * - Question editing capabilities for students
 * - Question status toggling and deletion for professors
 * - Loading and empty state handling
 * 
 * @param {QuestionListProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
const QuestionList: React.FC<QuestionListProps> = React.memo(({
  questions,
  isProfessor,
  isStudent = false,
  studentId = '',
  emptyMessage = "No questions yet.",
  onDelete,
  onToggleStatus
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Format timestamp to a readable date/time
   */
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };
  
  /**
   * Start editing a question
   */
  const handleEdit = (question: Question) => {
    setEditingId(question.id);
    setEditText(question.text);
    setError(null);
  };
  
  /**
   * Cancel editing a question
   */
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setError(null);
  };
  
  /**
   * Save edited question
   */
  const handleSaveEdit = async (questionId: string) => {
    if (!editText.trim()) {
      setError('Question cannot be empty');
      return;
    }
    
    if (!studentId) {
      setError('Cannot edit: Student ID is missing');
      return;
    }
    
    setIsUpdating(true);
    setError(null);
    
    try {
      const success = await updateQuestion(questionId, editText, studentId);
      
      if (success) {
        setEditingId(null);
        setEditText('');
      } else {
        setError('Failed to update question');
      }
    } catch (error) {
      console.error('Error updating question:', error);
      setError('An error occurred while updating the question');
    } finally {
      setIsUpdating(false);
    }
  };
  
  /**
   * Delete a question
   */
  const handleDelete = async (questionId: string) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      try {
        // If a custom delete handler is provided, use it
        if (onDelete) {
          onDelete(questionId);
          return;
        }
        
        // Otherwise use the default implementation
        const success = await deleteQuestion(questionId);
        
        if (!success) {
          setError('Failed to delete question');
        }
      } catch (error) {
        console.error('Error deleting question:', error);
        setError('An error occurred while deleting the question');
      }
    }
  };
  
  /**
   * Toggle a question's answered/unanswered status
   */
  const toggleQuestionStatus = async (questionId: string, currentStatus: 'answered' | 'unanswered') => {
    // If a custom toggle handler is provided, use it
    if (onToggleStatus) {
      try {
        setUpdatingStatusId(questionId);
        onToggleStatus(questionId, currentStatus);
      } catch (error) {
        console.error('Error toggling question status:', error);
        setError('Failed to update question status');
      } finally {
        // Update UI optimistically
        setUpdatingStatusId(null);
      }
      return;
    }
    
    // Otherwise use the default implementation
    setUpdatingStatusId(questionId);
    setError(null);
    
    try {
      const newStatus = currentStatus === 'answered' ? 'unanswered' : 'answered';
      const success = await updateQuestionStatus(questionId, newStatus);
      
      if (!success) {
        setError('Failed to update question status');
      }
    } catch (error) {
      console.error('Error updating question status:', error);
      setError('An error occurred while updating the question status');
    } finally {
      setUpdatingStatusId(null);
    }
  };
  
  /**
   * Check if user can edit the question
   */
  const canEditQuestion = (question: Question): boolean => {
    // Only students can edit their own questions
    return isStudent && studentId === question.studentId;
  };
  
  /**
   * Check if user can delete the question
   */
  const canDeleteQuestion = (question: Question): boolean => {
    // Professors can delete any question, students can only delete their own
    return isProfessor || (isStudent && studentId === question.studentId);
  };

  /**
   * Renders the loading state when questions are being fetched
   * @returns {JSX.Element|null} Loading UI or null
   */
  const renderLoading = useMemo(() => {
    if (questions.length === 0) {
      return (
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-primary dark:border-dark-primary"></div>
          <span className="ml-2 text-xs sm:text-sm text-text-secondary dark:text-dark-text-secondary">Loading questions...</span>
        </div>
      );
    }
    return null;
  }, [questions.length]);

  /**
   * Renders an empty state when no questions are available
   * @returns {JSX.Element|null} Empty state UI or null
   */
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

  /**
   * Renders the list of question items with appropriate controls
   * @returns {JSX.Element[]} Array of question item elements
   */
  const questionItems = useMemo(() => {
    return questions.map((question) => {
      // Check if this question belongs to the current student
      const isOwnQuestion = isStudent && studentId === question.studentId;

      return (
        <li key={question.id} className="py-3 sm:py-4 border-b border-background-tertiary dark:border-dark-background-tertiary last:border-0 relative">
          {/* Status indicator for students and professors */}
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
                      onClick={() => handleSaveEdit(question.id)}
                      disabled={isUpdating}
                      className="rounded-md px-2 py-1 text-xs font-medium bg-primary text-white hover:bg-primary-hover dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover"
                    >
                      {isUpdating ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
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
                    className="text-sm sm:text-base text-text dark:text-dark-text break-words whitespace-normal overflow-wrap-anywhere pr-8 pl-2"
                  >
                    {question.text}
                  </div>
                  {/* Always show timestamp in smaller text */}
                  <p className="text-xs text-text-tertiary dark:text-dark-text-tertiary pl-2 mt-1">
                    {new Date(question.timestamp).toLocaleString()}
                  </p>
                </>
              )}
            </div>
            
            {/* Action buttons for professors or students who own the question */}
            {(isProfessor || isOwnQuestion) && editingId !== question.id && (
              <div className="flex items-center justify-end space-x-2 mt-2">
                {/* Professor controls */}
                {isProfessor && (
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleQuestionStatus(question.id, question.status || 'unanswered')}
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
                    <span className="mx-2 text-xs text-text-secondary dark:text-dark-text-secondary">
                      {question.status === 'answered' ? 'Answered' : 'Unanswered'}
                    </span>
                    <button
                      onClick={() => handleDelete(question.id)}
                      disabled={updatingStatusId === question.id}
                      className={`rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors ${
                        updatingStatusId === question.id
                          ? 'bg-background-tertiary text-text-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-tertiary'
                          : 'bg-error-light/20 text-error-dark hover:bg-error-light/30 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20'
                      }`}
                    >
                      {updatingStatusId === question.id ? 'Updating...' : 'Delete'}
                    </button>
                  </div>
                )}
                
                {/* Student controls - only for their own questions */}
                {isOwnQuestion && (
                  <>
                    <button
                      onClick={() => handleEdit(question)}
                      className="rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-dark-primary-900/30 dark:text-dark-primary-300 dark:hover:bg-dark-primary-900/50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(question.id)}
                      disabled={updatingStatusId === question.id}
                      className={`rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors ${
                        updatingStatusId === question.id
                          ? 'bg-background-tertiary text-text-tertiary dark:bg-dark-background-tertiary dark:text-dark-text-tertiary'
                          : 'bg-error-light/20 text-error-dark hover:bg-error-light/30 dark:bg-error-light/10 dark:text-error-light dark:hover:bg-error-light/20'
                      }`}
                    >
                      {updatingStatusId === question.id ? 'Updating...' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </li>
      );
    });
  }, [questions, isProfessor, isStudent, studentId, editingId, updatingStatusId, handleEdit, handleSaveEdit, handleCancelEdit, handleDelete, toggleQuestionStatus, isUpdating, editText]);

  if (questions.length === 0) return renderEmptyState;

  return (
    <ul className="divide-y divide-background-tertiary dark:divide-dark-background-tertiary rounded-md bg-white p-2 sm:p-4 dark:bg-dark-background-secondary w-full overflow-hidden">
      {questionItems}
    </ul>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList; 