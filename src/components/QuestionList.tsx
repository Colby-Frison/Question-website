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
 * @property {boolean} [showControls] - Whether to show edit and delete buttons (defaults to true)
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
  showControls?: boolean;
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
  showControls = true,
  onDelete,
  onToggleStatus
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatusUpdates, setOptimisticStatusUpdates] = useState<Record<string, 'answered' | 'unanswered'>>({});

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
    // Set updating status and show the loader
    setUpdatingStatusId(questionId);
    setError(null);

    // Calculate the new status
    const newStatus = currentStatus === 'answered' ? 'unanswered' : 'answered';
    
    // Update UI optimistically
    setOptimisticStatusUpdates(prev => ({
      ...prev,
      [questionId]: newStatus
    }));
    
    // If a custom toggle handler is provided, use it
    if (onToggleStatus) {
      try {
        await onToggleStatus(questionId, currentStatus);
      } catch (error) {
        console.error('Error toggling question status:', error);
        setError('Failed to update question status');
        
        // Revert the optimistic update on error
        setOptimisticStatusUpdates(prev => {
          const updated = { ...prev };
          delete updated[questionId];
          return updated;
        });
      } finally {
        // Finish update
        setUpdatingStatusId(null);
      }
      return;
    }
    
    // Otherwise use the default implementation
    try {
      await updateQuestionStatus(questionId, newStatus);
    } catch (error) {
      console.error('Error toggling question status:', error);
      setError('Failed to update question status');
      
      // Revert the optimistic update on error
      setOptimisticStatusUpdates(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
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
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-blue-500 dark:border-blue-400"></div>
          <span className="ml-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">Loading questions...</span>
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
        <div className="rounded-md bg-gray-50 p-4 sm:p-8 text-center dark:bg-gray-800">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">{emptyMessage}</p>
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
        <li key={question.id} className="py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 last:border-0 relative">
          {/* Status indicator for students and professors */}
          <div className="absolute top-2 right-2 z-10">
            <div 
              className={`h-2 w-2 rounded-full ${
                question.status === 'answered' 
                  ? 'bg-green-400 dark:bg-green-500' 
                  : 'bg-red-400 dark:bg-red-500'
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
                    className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                    rows={3}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSaveEdit(question.id)}
                      disabled={isUpdating}
                      className="rounded-md px-2 py-1 text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                    >
                      {isUpdating ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                      className="rounded-md px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div 
                    className="text-sm sm:text-base text-gray-900 dark:text-gray-100 break-words whitespace-normal overflow-wrap-anywhere pr-8 pl-2"
                  >
                    {question.text}
                  </div>
                  {/* Always show timestamp in smaller text */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 pl-2 mt-1">
                    {new Date(question.timestamp).toLocaleString()}
                  </p>
                </>
              )}
            </div>
            
            {/* Action buttons for professors or students who own the question */}
            {((isProfessor || isOwnQuestion) && editingId !== question.id && showControls) && (
              <div className="flex items-center justify-end space-x-2 mt-2">
                {/* Professor controls */}
                {isProfessor && (
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleQuestionStatus(question.id, question.status || 'unanswered')}
                      disabled={updatingStatusId === question.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        updatingStatusId === question.id
                          ? 'bg-gray-300 dark:bg-gray-600'
                          : optimisticStatusUpdates[question.id] === 'answered' || (!optimisticStatusUpdates.hasOwnProperty(question.id) && question.status === 'answered')
                            ? 'bg-green-400 dark:bg-green-500'
                            : 'bg-red-400 dark:bg-red-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          updatingStatusId === question.id 
                            ? 'translate-x-3 animate-pulse'
                            : optimisticStatusUpdates[question.id] === 'answered' || (!optimisticStatusUpdates.hasOwnProperty(question.id) && question.status === 'answered')
                              ? 'translate-x-6' 
                              : 'translate-x-1'
                        }`}
                      ></span>
                    </button>
                    <span className="mx-2 text-xs text-gray-600 dark:text-gray-300 min-w-[70px] inline-block">
                      {optimisticStatusUpdates[question.id] || question.status === 'answered' ? 'Answered' : 'Unanswered'}
                    </span>
                    <button
                      onClick={() => handleDelete(question.id)}
                      disabled={updatingStatusId === question.id}
                      className={`rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors ${
                        updatingStatusId === question.id
                          ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
                      }`}
                    >
                      Delete
                    </button>
                  </div>
                )}
                
                {/* Student controls - only for their own questions */}
                {isOwnQuestion && (
                  <>
                    <button
                      onClick={() => handleEdit(question)}
                      className="rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(question.id)}
                      disabled={updatingStatusId === question.id}
                      className={`rounded-md px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium transition-colors ${
                        updatingStatusId === question.id
                          ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
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
  }, [questions, isProfessor, isStudent, studentId, editingId, updatingStatusId, handleEdit, handleSaveEdit, handleCancelEdit, handleDelete, toggleQuestionStatus, isUpdating, editText, optimisticStatusUpdates, showControls]);

  if (questions.length === 0) return renderEmptyState;

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-md bg-white p-2 sm:p-4 dark:bg-gray-900 w-full overflow-hidden shadow-sm dark:shadow-[0_0_15px_rgba(0,0,0,0.2)]">
      {questionItems}
    </ul>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList; 