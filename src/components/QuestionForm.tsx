'use client';

import { useState } from 'react';
import { addQuestion } from '@/lib/questions';

interface QuestionFormProps {
  userIdentifier?: string;
  classCode: string;
}

export default function QuestionForm({ 
  userIdentifier = 'student',
  classCode 
}: QuestionFormProps) {
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const MAX_CHARS = 1000;

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
    
    setIsSubmitting(true);
    
    try {
      // Add the question
      await addQuestion(question, userIdentifier, classCode);
      
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
    <div className="rounded-lg bg-background-secondary p-4 sm:p-6 shadow-md transition-all dark:bg-dark-background-secondary dark:shadow-dark-md">
      <h2 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold text-text dark:text-dark-text">Ask a Question</h2>
      
      {error && (
        <div className="mb-3 sm:mb-4 rounded-md bg-red-50 p-3 sm:p-4 text-xs sm:text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-3 sm:mb-4 rounded-md bg-green-50 p-3 sm:p-4 text-xs sm:text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
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
            className="mt-1 block w-full rounded-md border border-background-tertiary bg-white px-3 py-2 text-sm sm:text-base text-text placeholder-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-dark-background-tertiary dark:bg-dark-background-tertiary dark:text-dark-text dark:placeholder-dark-text-tertiary dark:focus:border-dark-primary dark:focus:ring-dark-primary"
            placeholder="Type your question here..."
            value={question}
            onChange={handleQuestionChange}
            maxLength={MAX_CHARS + 10} // Allow a little extra for better UX, but still validate
          ></textarea>
          <div className={`mt-1 text-right text-xs ${
            charCount > MAX_CHARS 
              ? 'text-red-600 dark:text-red-400' 
              : 'text-text-tertiary dark:text-dark-text-tertiary'
          }`}>
            {charCount}/{MAX_CHARS} characters
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || charCount > MAX_CHARS}
            className="rounded-md bg-primary px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-primary/70 dark:bg-dark-primary dark:text-dark-text-inverted dark:hover:bg-dark-primary-hover dark:focus:ring-dark-primary dark:disabled:bg-dark-primary/70"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Question'}
          </button>
        </div>
      </form>
    </div>
  );
} 