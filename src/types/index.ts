export interface User {
  userType: 'student' | 'professor';
}

export interface Question {
  id: string;
  text: string;
  timestamp: number;
  status?: 'answered' | 'unanswered';
  studentId?: string;  // ID of the student who asked the question
  sessionCode?: string; // Code of the session this question belongs to
}

export interface ClassSession {
  id: string;
  code: string;
  sessionCode: string;  // Unique code for this session that students use to join
  professorId: string;
  status: 'active' | 'archived' | 'closed';
  createdAt: number;
  lastActiveAt: number;
  lastActive: number;
  archivedAt?: number;
  closedAt?: number;  // Timestamp when the session was explicitly closed
}

export interface ClassArchiveSettings {
  autoArchiveAfterDays: number;
  deleteArchivedAfterDays: number;
  deleteClosedAfterDays: number;
} 