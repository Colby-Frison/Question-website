import { User } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// Simplified user management without authentication
// Just storing the user type (student or professor) and a unique ID

// Generate a unique ID for the user if one doesn't exist
const getOrCreateUserId = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('userId', userId);
  }
  
  return userId;
};

export const setUserType = (userType: 'student' | 'professor'): string => {
  const userId = getOrCreateUserId();
  localStorage.setItem('userType', userType);
  return userId;
};

export const getUserType = (): 'student' | 'professor' | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  const userType = localStorage.getItem('userType');
  return (userType as 'student' | 'professor' | null);
};

export const getUserId = (): string => {
  return getOrCreateUserId();
};

export const clearUserType = (): void => {
  localStorage.removeItem('userType');
  // Don't remove userId to maintain the same identity
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

export const isStudent = (): boolean => {
  return getUserType() === 'student';
};

export const isProfessor = (): boolean => {
  return getUserType() === 'professor';
}; 