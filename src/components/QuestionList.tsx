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
   * Delete a question with confirmation
   */
  const handleDelete = useCallback(async (questionId: string) => {
    // Confirm before deleting
    if (!confirm('Are you sure you want to delete this question?')) {
      return;
    }
    
    try {
      await deleteQuestion(questionId);
      
      // Call the onDelete callback if provided
      if (onDelete) {
        onDelete(questionId);
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      setError('Failed to delete question. Please try again.');
    }
  }, [onDelete]);
  
  /**
   * Toggle a question's status between answered and unanswered
   */
  const handleToggleStatus = useCallback(async (questionId: string, currentStatus: 'answered' | 'unanswered') => {
    const newStatus = currentStatus === 'answered' ? 'unanswered' : 'answered';
    
    // Set optimistic update
    setOptimisticStatusUpdates(prev => ({
      ...prev,
      [questionId]: newStatus
    }));
    
    setUpdatingStatusId(questionId);
    
    try {
      await updateQuestionStatus(questionId, newStatus);
      
      // Call the onToggleStatus callback if provided
      if (onToggleStatus) {
        onToggleStatus(questionId, newStatus);
      }
      
      // Clear optimistic update after success
      setOptimisticStatusUpdates(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    } catch (error) {
      console.error('Error toggling question status:', error);
      
      // Revert optimistic update on error
      setOptimisticStatusUpdates(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    } finally {
      setUpdatingStatusId(null);
    }
  }, [onToggleStatus]);
  
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
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <span className="ml-2 text-xs sm:text-sm text-gray-600">Loading questions...</span>
        </div>
      );
    }
    return null;
  }, [questions.length]);

  /**
   * Render empty state for when there are no questions
   */
  const renderEmptyState = useMemo(() => (
    <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
      <svg 
        className="w-12 h-12 mx-auto text-gray-400 mb-4" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={1.5} 
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
        />
      </svg>
      <p className="text-gray-600">{emptyMessage}</p>
    </div>
  ), [emptyMessage]);

  /**
   * Render all questions
   */
  const renderQuestions = useMemo(() => {
    return questions.map((question) => {
      const isEditing = editingId === question.id;
      const isUpdatingThis = isUpdating && editingId === question.id;
      const isUpdatingStatus = updatingStatusId === question.id;
      
      // Get effective status accounting for optimistic updates
      const effectiveStatus = optimisticStatusUpdates[question.id] || question.status;
      
      // Determine status indicator color
      const statusClass = effectiveStatus === 'answered' 
        ? 'bg-green-500' 
        : 'bg-yellow-500';
      
      // Only show edit/delete for students who own the question or professors
      const canControl = showControls && (
        (isProfessor) || 
        (isStudent && studentId === question.studentId)
      );
      
      return (
        <li 
          key={question.id} 
          className={`p-4 mb-3 bg-white border border-gray-200 rounded-lg shadow transition-colors ${
            isEditing ? 'border-blue-300' : ''
          }`}
        >
          {isEditing ? (
            // Edit mode
            <div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-2 text-gray-800 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
                rows={3}
                placeholder="Edit your question..."
              />
              
              {error && (
                <p className="text-red-500 text-sm mt-1">{error}</p>
              )}
              
              <div className="flex justify-end mt-2 space-x-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveEdit(question.id)}
                  disabled={isUpdatingThis}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center"
                >
                  {isUpdatingThis ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
          ) : (
            // View mode
            <div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-800 mb-2">{question.text}</p>
                  <div className="text-sm text-gray-500 flex items-center flex-wrap">
                    <span className="inline-block mr-2 text-gray-600">
                      {formatTimestamp(question.timestamp)}
                    </span>
                    <span className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${statusClass}`}></span>
                      <span className="text-gray-600">
                        {effectiveStatus === 'answered' ? 'Answered' : 'Waiting for answer'}
                      </span>
                    </span>
                  </div>
                </div>
                
                {/* Action buttons */}
                {canControl && (
                  <div className="flex space-x-1 ml-2">
                    {/* Professor controls */}
                    {isProfessor && (
                      <button
                        onClick={() => handleToggleStatus(question.id, effectiveStatus)}
                        disabled={isUpdatingStatus}
                        className="p-1 text-gray-500 hover:text-blue-500 transition-colors"
                        title={effectiveStatus === 'answered' ? 'Mark as unanswered' : 'Mark as answered'}
                      >
                        {isUpdatingStatus ? (
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : effectiveStatus === 'answered' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        )}
                      </button>
                    )}
                    
                    {/* Student edit controls */}
                    {isStudent && studentId === question.studentId && (
                      <button
                        onClick={() => handleEdit(question)}
                        className="p-1 text-gray-500 hover:text-blue-500 transition-colors"
                        title="Edit question"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    
                    {/* Delete button for both roles */}
                    <button
                      onClick={() => handleDelete(question.id)}
                      className="p-1 text-gray-500 hover:text-red-500 transition-colors"
                      title="Delete question"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </li>
      );
    });
  }, [questions, editingId, editText, isUpdating, updatingStatusId, optimisticStatusUpdates, error, isProfessor, isStudent, studentId, showControls, handleDelete, handleToggleStatus, handleEdit, formatTimestamp, handleSaveEdit, handleCancelEdit]);

  if (questions.length === 0) return renderEmptyState;

  return (
    <ul className="divide-y divide-gray-200 rounded-md bg-white p-2 sm:p-4 w-full overflow-hidden shadow-sm">
      {renderQuestions}
    </ul>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList; 