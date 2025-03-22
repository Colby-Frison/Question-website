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
    <div className="w-full transition-all">
      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-200 dark:border-green-800">
          Your question has been submitted!
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="w-full">
        <div className="mb-3">
          <textarea
            id="question"
            rows={3}
            className="w-full p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition"
            placeholder="Type your question here..."
            value={question}
            onChange={handleQuestionChange}
            maxLength={MAX_CHARS + 10} // Allow a little extra for better UX, but still validate
          ></textarea>
          <div className={`mt-1 text-right text-xs ${
            charCount > MAX_CHARS 
              ? 'text-red-600 dark:text-red-400' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {charCount}/{MAX_CHARS} characters
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || charCount > MAX_CHARS}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Question'}
          </button>
        </div>
      </form>
    </div>
  );
} 