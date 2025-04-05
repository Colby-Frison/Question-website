import { io, Socket } from 'socket.io-client';

export interface Question {
  id: string;
  text: string;
  studentId: string;
  studentName: string;
  isProfessor: boolean;
  isActive: boolean;
  isDeleted: boolean;
  timestamp: number;
}

export interface Answer {
  id: string;
  questionId: string;
  studentId: string;
  studentName: string;
  text: string;
  timestamp: number;
  points?: number;
}

export interface SessionUpdate {
  students: string[];
  questions: Question[];
  activeQuestion: Question | null;
}

class WebSocketService {
  private socket: Socket | null = null;
  private static instance: WebSocketService;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public connect() {
    if (!this.socket) {
      this.socket = io('http://localhost:3001');
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  public joinSession(sessionCode: string, userId: string, isProfessor: boolean) {
    if (this.socket) {
      this.socket.emit('joinClass', { sessionCode, userId, isProfessor });
    }
  }

  public onQuestionCreated(callback: (question: Question) => void) {
    if (this.socket) {
      this.socket.on('questionCreated', callback);
    }
  }

  public offQuestionCreated() {
    if (this.socket) {
      this.socket.off('questionCreated');
    }
  }

  public onAnswerUpdate(callback: (answer: Answer) => void) {
    if (this.socket) {
      this.socket.on('answerUpdate', callback);
    }
  }

  public offAnswerUpdate() {
    if (this.socket) {
      this.socket.off('answerUpdate');
    }
  }

  public onQuestionEnded(callback: (questionId: string) => void) {
    if (this.socket) {
      this.socket.on('questionEnded', callback);
    }
  }

  public offQuestionEnded() {
    if (this.socket) {
      this.socket.off('questionEnded');
    }
  }

  public onQuestionDeleted(callback: (questionId: string) => void) {
    if (this.socket) {
      this.socket.on('questionDeleted', callback);
    }
  }

  public offQuestionDeleted() {
    if (this.socket) {
      this.socket.off('questionDeleted');
    }
  }

  public deleteQuestion(questionId: string) {
    if (this.socket) {
      this.socket.emit('deleteQuestion', questionId);
    }
  }

  public onActiveQuestionUpdate(callback: (question: Question | null) => void) {
    if (this.socket) {
      this.socket.on('activeQuestionUpdate', callback);
    }
  }

  public offActiveQuestionUpdate() {
    if (this.socket) {
      this.socket.off('activeQuestionUpdate');
    }
  }

  public onSessionUpdate(callback: (data: SessionUpdate) => void) {
    if (this.socket) {
      this.socket.on('sessionUpdate', callback);
    }
  }

  public offSessionUpdate() {
    if (this.socket) {
      this.socket.off('sessionUpdate');
    }
  }

  public createQuestion(question: Omit<Question, 'id' | 'timestamp'>) {
    if (this.socket) {
      const newQuestion: Question = {
        ...question,
        id: Date.now().toString(),
        timestamp: Date.now(),
        isActive: question.isProfessor // Only professor questions can be active
      };
      this.socket.emit('createQuestion', newQuestion);
    }
  }

  public createAnswer(answer: Omit<Answer, 'id' | 'timestamp'>) {
    if (this.socket) {
      this.socket.emit('createAnswer', {
        ...answer,
        id: Date.now().toString(),
        timestamp: Date.now()
      });
    }
  }

  public endQuestion(questionId: string) {
    if (this.socket) {
      this.socket.emit('endQuestion', questionId);
    }
  }

  public awardPoints(studentId: string, points: number) {
    if (this.socket) {
      this.socket.emit('awardPoints', { studentId, points });
    }
  }

  public removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

export const socketService = WebSocketService.getInstance(); 