export interface User {
  userType: 'student' | 'professor';
}

export interface Question {
  id: string;
  text: string;
  timestamp: number;
  studentId?: string;
  status?: 'answered' | 'unanswered';
}

export interface Answer {
  id: string;
  text: string;
  timestamp: number;
  studentId: string;
  questionText?: string;
  activeQuestionId?: string;
  likes?: number;
  likedBy?: string[];
}

export interface SessionUpdate {
  students: string[];
  professorId: string;
}

export interface ClassSession {
  id: string;
  code: string;
  professorId: string;
  status: 'active' | 'closed' | 'archived';
  startTime: number;
  endTime?: number;
}

export interface StudentPoints {
  total: number;
  lastUpdated: number;
}

export interface ActiveQuestion {
  id: string;
  text: string;
  timestamp: number;
}

export type UserType = 'student' | 'professor';

export interface ClassArchiveSettings {
  autoArchiveAfterDays: number;
  deleteArchivedAfterDays: number;
  deleteClosedAfterDays: number;
} 