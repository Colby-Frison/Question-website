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
      const isEditing = editingId === question.id;
      const isBeingUpdated = updatingStatusId === question.id;
      
      // Get optimistic status if available, otherwise use the question's status
      const effectiveStatus = optimisticStatusUpdates[question.id] || question.status || 'unanswered';
      
      // Is this question owned by the current student?
      const isOwner = isStudent && studentId === question.studentId;
      
      return (
        <li 
          key={question.id} 
          className={`relative border-b border-gray-200 dark:border-gray-700 py-4 transition-all ${
            isBeingUpdated ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {/* Status indicator */}
          <div className="absolute top-4 left-0 w-1 h-5/6 rounded-r">
            <div 
              className={`w-1 h-full rounded-r transition-all ${
                effectiveStatus === 'answered' 
                  ? 'bg-green-400 dark:bg-green-500' 
                  : 'bg-red-400 dark:bg-red-500'
              }`}
            />
          </div>
          
          <div className="pl-4">
            {/* Editing state */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea 
                  value={editText} 
                  onChange={(e) => setEditText(e.target.value)} 
                  className="w-full p-2 border border-blue-300 dark:border-dark-primary rounded-md focus:ring-2 focus:ring-blue-500 dark:focus:ring-dark-primary focus:border-transparent dark:bg-dark-background-tertiary dark:text-dark-text-primary"
                  rows={3}
                />
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleSaveEdit(question.id)} 
                    disabled={isUpdating}
                    className="px-3 py-1 bg-blue-500 dark:bg-dark-primary text-white dark:text-dark-text-inverted rounded hover:bg-blue-600 dark:hover:bg-dark-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdating ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </span>
                    ) : 'Save'}
                  </button>
                  <button 
                    onClick={() => handleCancelEdit()} 
                    className="px-3 py-1 bg-gray-200 dark:bg-dark-background-tertiary text-gray-800 dark:text-dark-text-secondary rounded hover:bg-gray-300 dark:hover:bg-dark-background-quaternary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Question text */}
                <p className="mb-1 text-gray-900 dark:text-dark-text-primary">{question.text}</p>
                
                {/* Metadata */}
                <div className="flex items-center text-xs text-gray-500 dark:text-dark-text-tertiary">
                  <span>
                    {new Date(question.timestamp).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  
                  <span className="mx-1">•</span>
                  <span className={
                    effectiveStatus === 'answered' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }>
                    {effectiveStatus === 'answered' ? 'Answered' : 'Unanswered'}
                  </span>
                </div>
              </>
            )}
            
            {/* Action buttons for professors and students */}
            {!isEditing && showControls && (
              <div className="mt-3 flex gap-2">
                {isProfessor && (
                  <button 
                    onClick={() => toggleQuestionStatus(question.id, effectiveStatus)}
                    disabled={isBeingUpdated}
                    className={`px-2.5 py-1 text-xs rounded ${
                      effectiveStatus === 'answered'
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50'
                        : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50'
                    }`}
                  >
                    {effectiveStatus === 'answered' ? 'Mark Unanswered' : 'Mark Answered'}
                  </button>
                )}
                
                {/* Delete button - shown to professors or if the student owns the question */}
                {(isProfessor || isOwner) && (
                  <button 
                    onClick={() => handleDelete(question.id)}
                    className="px-2.5 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                )}
                
                {/* Edit button - shown only if the student owns the question */}
                {isOwner && (
                  <button 
                    onClick={() => handleEdit(question)}
                    className="px-2.5 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                  >
                    Edit
                  </button>
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