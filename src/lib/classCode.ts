// In a real application, this would use a database
// For this demo, we're using localStorage for simplicity

export const generateClassCode = (): string => {
  // Generate a random 6-character alphanumeric code
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const getClassCode = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  return localStorage.getItem('classCode');
};

export const setClassCode = (code: string): void => {
  localStorage.setItem('classCode', code);
};

export const getJoinedClass = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  return localStorage.getItem('joinedClass');
};

export const joinClass = (code: string): void => {
  localStorage.setItem('joinedClass', code);
};

export const leaveClass = (): void => {
  localStorage.removeItem('joinedClass');
};

export const validateClassCode = (code: string): boolean => {
  const professorClassCode = getClassCode();
  return code === professorClassCode;
}; 