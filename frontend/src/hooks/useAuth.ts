import { useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  type: 'student' | 'professor';
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const storedUserType = localStorage.getItem('userType');
      console.log('Stored user type:', storedUserType);
      console.log('Current path:', window.location.pathname);
      
      const isProfessor = storedUserType === 'professor' || window.location.pathname.includes('/professor');
      console.log('Is professor:', isProfessor);
      
      if (isProfessor) {
        console.log('Setting professor in localStorage');
        localStorage.setItem('userType', 'professor');
        return {
          id: '1',
          name: 'Test Professor',
          type: 'professor' as const
        };
      } else {
        console.log('Setting student in localStorage');
        localStorage.setItem('userType', 'student');
        return {
          id: '1',
          name: 'Test Student',
          type: 'student' as const
        };
      }
    }
    return null;
  });

  // Add effect to ensure localStorage is set on mount
  useEffect(() => {
    if (user) {
      console.log('Setting user type in effect:', user.type);
      localStorage.setItem('userType', user.type);
    }
  }, [user]);

  const logout = () => {
    localStorage.removeItem('userType');
    setUser(null);
  };

  return { user, logout };
} 