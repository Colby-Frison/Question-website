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