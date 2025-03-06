export interface User {
  userType: 'student' | 'professor';
}

export interface Question {
  id: string;
  text: string;
  timestamp: number;
} 