import { User } from '@/types';

// In a real application, this would be a proper authentication system
// For this demo, we're using localStorage for simplicity

export const login = (email: string, userType: 'student' | 'professor'): User => {
  const user: User = { email, userType };
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

export const logout = (): void => {
  localStorage.removeItem('user');
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  const userJson = localStorage.getItem('user');
  if (!userJson) {
    return null;
  }
  
  try {
    return JSON.parse(userJson) as User;
  } catch (error) {
    console.error('Error parsing user from localStorage', error);
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

export const isStudent = (): boolean => {
  const user = getCurrentUser();
  return user !== null && user.userType === 'student';
};

export const isProfessor = (): boolean => {
  const user = getCurrentUser();
  return user !== null && user.userType === 'professor';
}; 