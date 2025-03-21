'use client';

import { useState } from 'react';
import { addQuestion } from '@/lib/questions';

/**
 * Interface for QuestionForm component props
 * @interface QuestionFormProps
 * @property {string} studentId - ID of the student submitting the question
 * @property {string} sessionCode - The session code to associate the question with
 */
interface QuestionFormProps {
  studentId: string;
  sessionCode: string;
}

/**
 * Form component for submitting questions
 * 
 * This component:
 * - Provides a textarea for entering questions
 * - Validates input length and prevents empty submissions
 * - Shows character count and validation errors
 * - Displays success message after submission
 * - Handles the API call to submit questions
 * 
 * @param {QuestionFormProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function QuestionForm({ 
  studentId,
  sessionCode 
}: QuestionFormProps) {
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const MAX_CHARS = 1000;

  /**
   * Handles form submission
   * - Validates the question input
   * - Makes API call to add the question
   * - Shows success message and resets form on success
   * - Displays errors if submission fails
   * 
   * @param {React.FormEvent} e - Form event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (question.length > MAX_CHARS) {
      setError(`Question is too long. Maximum ${MAX_CHARS} characters allowed.`);
      return;
    }
    
    if (!studentId || !sessionCode) {
      setError('Missing student ID or session code. Please refresh and try again.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Add the question using the new question system
      const result = await addQuestion(question, studentId, sessionCode);
      
      if (!result) {
        throw new Error('Failed to submit question');
      }
      
      // Clear the form and show success message
      setQuestion('');
      setCharCount(0);
      setError('');
      setSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error submitting question:', error);
      setError('Failed to submit question. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handles changes to the question input
   * - Updates question state and character count
   * - Clears error messages when user types
   * 
   * @param {React.ChangeEvent<HTMLTextAreaElement>} e - Input change event
   */
  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setQuestion(text);
    setCharCount(text.length);
    
    // Clear error if user starts typing again
    if (error) {
      setError('');
    }
  };

  return (
    <div className="rounded-lg bg-white p-4 sm:p-6 shadow-all-around transition-all dark:bg-dark-background-secondary">
      <h2 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold text-text dark:text-dark-text">Ask a Question</h2>
      
      {error && (
        <div className="mb-3 sm:mb-4 rounded-md bg-error-light/20 p-3 sm:p-4 text-xs sm:text-sm text-error-dark dark:bg-error-light/10 dark:text-error-light">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-3 sm:mb-4 rounded-md bg-success-light/20 p-3 sm:p-4 text-xs sm:text-sm text-success-dark dark:bg-success-light/10 dark:text-success-light">
          Your question has been submitted!
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
        <div className="mb-3 sm:mb-4">
          <label htmlFor="question" className="block text-xs sm:text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
            Your Question
          </label>
          <textarea
            id="question"
            rows={3}
            className="form-input"
            placeholder="Type your question here..."
            value={question}
            onChange={handleQuestionChange}
            maxLength={MAX_CHARS + 10} // Allow a little extra for better UX, but still validate
          ></textarea>
          <div className={`mt-1 text-right text-xs ${
            charCount > MAX_CHARS 
              ? 'text-error-dark dark:text-error-light' 
              : 'text-text-tertiary dark:text-dark-text-tertiary'
          }`}>
            {charCount}/{MAX_CHARS} characters
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || charCount > MAX_CHARS}
            className="btn-primary"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Question'}
          </button>
        </div>
      </form>
    </div>
  );
} 