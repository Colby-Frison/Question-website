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
        <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-800 border border-green-200">
          Your question has been submitted!
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="w-full">
        <div className="mb-4">
          <textarea
            id="question"
            rows={3}
            className="w-full p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="Type your question here..."
            value={question}
            onChange={handleQuestionChange}
            maxLength={MAX_CHARS + 10} // Allow a little extra for better UX, but still validate
          ></textarea>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {question.length > 0 && (
              <span>{question.length} character{question.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setQuestion('')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                isSubmitting || question.trim().length === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
              disabled={isSubmitting || question.trim().length === 0}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Submitting...</span>
                </div>
              ) : (
                'Submit Question'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
} 