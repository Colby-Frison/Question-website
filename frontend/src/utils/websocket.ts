import { Question, Answer, SessionUpdate } from '@/types';

export const formatQuestion = (question: Partial<Question>): Question => {
  return {
    id: question.id || Date.now().toString(),
    text: question.text || '',
    timestamp: question.timestamp || Date.now(),
    studentId: question.studentId,
    status: question.status || 'unanswered',
  };
};

export const formatAnswer = (answer: Partial<Answer>): Answer => {
  return {
    id: answer.id || Date.now().toString(),
    text: answer.text || '',
    timestamp: answer.timestamp || Date.now(),
    studentId: answer.studentId || '',
    questionText: answer.questionText,
    activeQuestionId: answer.activeQuestionId,
    likes: answer.likes || 0,
    likedBy: answer.likedBy || [],
  };
};

export const validateSessionUpdate = (data: any): SessionUpdate | null => {
  if (!data || typeof data !== 'object') return null;

  const { students, professorId } = data;
  if (!Array.isArray(students) || typeof professorId !== 'string') return null;

  return {
    students,
    professorId,
  };
};

export const handleWebSocketError = (error: any) => {
  console.error('WebSocket error:', error);
  // Add any additional error handling logic here
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}; 