import { Question } from '@/types';

// In a real application, this would use a database
// For this demo, we're using localStorage for simplicity

export const getQuestions = (): Question[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  
  const questionsJson = localStorage.getItem('questions');
  if (!questionsJson) {
    return [];
  }
  
  try {
    return JSON.parse(questionsJson) as Question[];
  } catch (error) {
    console.error('Error parsing questions from localStorage', error);
    return [];
  }
};

export const getUserQuestions = (email: string): Question[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  
  const questionsJson = localStorage.getItem(`myQuestions_${email}`);
  if (!questionsJson) {
    return [];
  }
  
  try {
    return JSON.parse(questionsJson) as Question[];
  } catch (error) {
    console.error('Error parsing user questions from localStorage', error);
    return [];
  }
};

export const addQuestion = (text: string, email: string): Question => {
  const newQuestion: Question = {
    id: Date.now().toString(),
    text,
    timestamp: Date.now(),
  };
  
  // Add to global questions
  const allQuestions = getQuestions();
  const updatedQuestions = [...allQuestions, newQuestion];
  localStorage.setItem('questions', JSON.stringify(updatedQuestions));
  
  // Add to user's questions
  const userQuestions = getUserQuestions(email);
  const updatedUserQuestions = [...userQuestions, newQuestion];
  localStorage.setItem(`myQuestions_${email}`, JSON.stringify(updatedUserQuestions));
  
  return newQuestion;
};

export const deleteQuestion = (id: string): void => {
  // Remove from global questions
  const allQuestions = getQuestions();
  const updatedQuestions = allQuestions.filter(q => q.id !== id);
  localStorage.setItem('questions', JSON.stringify(updatedQuestions));
}; 