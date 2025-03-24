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
 * @property {function} [onStatusUpdated] - Optional callback when questions are updated (for forcing refresh)
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
  onStatusUpdated?: (updatedQuestions: Question[]) => void;
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
  onToggleStatus,
  onStatusUpdated
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Simple way to track manual overrides locally
  const [manualStatuses, setManualStatuses] = useState<Record<string, 'answered' | 'unanswered'>>({});

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
        // Update local state to reflect changes immediately
        if (questions) {
          const updatedQuestions = questions.map(q => 
            q.id === questionId 
              ? { ...q, text: editText } 
              : q
          );
          
          // Force a UI update through the parent component
          if (onStatusUpdated) {
            onStatusUpdated(updatedQuestions);
          }
        }
        
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
    
    console.log(`[QuestionList] Toggling status for question ${questionId}: ${currentStatus} -> ${newStatus}`);
    
    // Mark this question as being updated
    setUpdatingStatusId(questionId);
    setError(null);
    
    try {
      // Update database first
      const success = await updateQuestionStatus(questionId, newStatus);
      
      if (!success) {
        throw new Error('Failed to update status in database');
      }
      
      // Only update local state if database update was successful
      setManualStatuses(prev => ({
        ...prev,
        [questionId]: newStatus
      }));
      
      // Update the parent component with the new status
      if (questions && onStatusUpdated) {
        const updatedQuestions = questions.map(q => 
          q.id === questionId 
            ? { ...q, status: newStatus as 'answered' | 'unanswered' } 
            : q
        ) as Question[];
        
        // Notify parent of the update
        onStatusUpdated(updatedQuestions);
      }
      
      // Call the parent's toggle callback if provided
      if (onToggleStatus) {
        onToggleStatus(questionId, newStatus);
      }
    } catch (error) {
      console.error(`[QuestionList] Error toggling question status:`, error);
      setError(`Failed to update status. Please try again.`);
      
      // Revert the manual status on error
      setManualStatuses(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    } finally {
      // Clear the updating status after a short delay
      setTimeout(() => {
        setUpdatingStatusId(null);
      }, 500);
    }
  }, [questions, onStatusUpdated, onToggleStatus]);
  
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
   * Get the effective status of a question, prioritizing manual overrides
   */
  const getEffectiveStatus = useCallback((question: Question): 'answered' | 'unanswered' => {
    // If we have a manual override, use that
    if (manualStatuses[question.id]) {
      return manualStatuses[question.id];
    }
    // Otherwise fall back to the question's status
    return question.status || 'unanswered';
  }, [manualStatuses]);

  /**
   * Renders the loading state when questions are being fetched
   * @returns {JSX.Element|null} Loading UI or null
   */
  const renderLoading = useMemo(() => {
    if (questions.length === 0) {
      return (
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-b-2 border-blue-500 dark:border-dark-primary"></div>
          <span className="ml-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">Loading questions...</span>
        </div>
      );
    }
    return null;
  }, [questions.length]);

  /**
   * Render empty state for when there are no questions
   */
  const renderEmptyState = useMemo(() => (
    <div className="py-8 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
      <svg 
        className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-4" 
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
      <p className="text-gray-600 dark:text-gray-400">{emptyMessage}</p>
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
      
      // Get effective status using our helper function
      const effectiveStatus = getEffectiveStatus(question);
      
      // Determine status indicator color
      const statusClass = effectiveStatus === 'answered' 
        ? 'bg-green-500 dark:bg-dark-primary' 
        : 'bg-yellow-500 dark:bg-dark-primary-light';
      
      // Only show edit/delete for students who own the question or professors
      const canControl = showControls && (
        (isProfessor) || 
        (isStudent && studentId === question.studentId)
      );
      
      return (
        <li 
          key={question.id} 
          className={`py-4 px-4 border-b border-gray-200 dark:border-gray-700 ${
            isEditing ? 'bg-blue-50 dark:bg-blue-900/10' : ''
          }`}
        >
          {isEditing ? (
            // Edit mode
            <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                className="w-full p-2 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md dark:bg-dark-background-tertiary focus:border-blue-500 dark:focus:border-dark-primary focus:outline-none"
                  rows={3}
                placeholder="Edit your question..."
              />
              
              {error && (
                <p className="text-red-500 dark:text-red-400 text-sm mt-1">{error}</p>
              )}
              
              <div className="flex justify-end mt-2 space-x-2">
                  <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-white rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                <button
                  onClick={() => handleSaveEdit(question.id)}
                  disabled={isUpdatingThis}
                  className="px-3 py-1 text-sm bg-blue-500 text-white dark:bg-dark-primary rounded-md hover:bg-blue-600 dark:hover:bg-dark-primary-hover transition-colors flex items-center"
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
                  <p className="font-medium text-gray-800 dark:text-white mb-2">{question.text}</p>
                  <div className="text-sm text-gray-500 dark:text-gray-300 flex items-center flex-wrap">
                    <span className="inline-block mr-2 text-gray-600 dark:text-gray-300">
                      {formatTimestamp(question.timestamp)}
                    </span>
                    <span className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${statusClass}`}></span>
                      <span className="text-gray-600 dark:text-gray-300">
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
                      isUpdatingStatus ? (
                        <button
                          disabled={true}
                          className="flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        >
                          <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Updating...</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(question.id, effectiveStatus)}
                          className={`flex items-center justify-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            effectiveStatus === 'answered' 
                              ? 'bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700' 
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          <div className="relative flex items-center">
                            {effectiveStatus === 'answered' ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Answered</span>
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span>Not Answered</span>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    )}
                
                    {/* Student edit controls */}
                    {isStudent && studentId === question.studentId && (
                    <button
                        onClick={() => handleEdit(question)}
                        className="p-1 text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-dark-primary transition-colors"
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
                      className="p-1 text-gray-500 dark:text-gray-300 hover:text-red-500 dark:hover:text-dark-red-400 transition-colors"
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
  }, [questions, editingId, editText, isUpdating, updatingStatusId, manualStatuses, error, isProfessor, isStudent, studentId, showControls, handleDelete, handleToggleStatus, handleEdit, formatTimestamp, handleSaveEdit, handleCancelEdit, getEffectiveStatus]);

  if (questions.length === 0) return renderEmptyState;

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900 w-full rounded-md overflow-hidden p-4">
      {renderQuestions}
    </ul>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList; 