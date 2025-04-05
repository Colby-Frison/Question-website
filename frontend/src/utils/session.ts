import { ClassSession } from '@/types';

const SESSION_STORAGE_KEY = 'currentSession';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const saveSessionToStorage = (session: ClassSession) => {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving session to storage:', error);
  }
};

export const getSessionFromStorage = (): ClassSession | null => {
  try {
    const sessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionStr) return null;

    const session = JSON.parse(sessionStr);
    return validateSession(session) ? session : null;
  } catch (error) {
    console.error('Error getting session from storage:', error);
    return null;
  }
};

export const clearSessionFromStorage = () => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing session from storage:', error);
  }
};

export const validateSession = (session: any): session is ClassSession => {
  if (!session || typeof session !== 'object') return false;

  const { id, code, professorId, status, startTime } = session;
  return (
    typeof id === 'string' &&
    typeof code === 'string' &&
    typeof professorId === 'string' &&
    ['active', 'closed', 'archived'].includes(status) &&
    typeof startTime === 'number'
  );
};

export const isSessionActive = (session: ClassSession): boolean => {
  if (session.status !== 'active') return false;
  
  const now = Date.now();
  const lastActivity = session.endTime || session.startTime;
  return now - lastActivity < SESSION_TIMEOUT;
};

export const generateSessionCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return code;
}; 