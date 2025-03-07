export interface User {
  userType: 'student' | 'professor';
}

export interface Question {
  id: string;
  text: string;
  timestamp: number;
}

export interface ClassSession {
  id: string;
  code: string;
  professorId: string;
  status: 'active' | 'archived' | 'closed';
  createdAt: number;
  lastActiveAt: number;
  archivedAt?: number;
}

export interface ClassArchiveSettings {
  autoArchiveAfterDays: number;
  deleteArchivedAfterDays: number;
  deleteClosedAfterDays: number;
} 