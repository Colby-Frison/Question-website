import { io, Socket } from 'socket.io-client';
import { Question, Answer, SessionUpdate } from '@/types';

export interface WebSocketEvents {
  generateClassCode: (professorId: string, className: string) => void;
  validateClassCode: (code: string) => void;
  joinClass: (sessionCode: string, userId: string, isProfessor: boolean) => void;
  createQuestion: (sessionCode: string, question: Partial<Question>) => void;
  endQuestion: (sessionCode: string) => void;
  onClassCodeGenerated: (callback: (data: { code: string; className: string }) => void) => void;
  onClassCodeValidated: (callback: (data: { isValid: boolean; className?: string }) => void) => void;
  onQuestionCreated: (callback: (question: Question) => void) => void;
  onQuestionEnded: (callback: () => void) => void;
  onSessionUpdate: (callback: (data: SessionUpdate) => void) => void;
}

class WebSocketService implements WebSocketEvents {
  private socket: Socket | null = null;
  private static instance: WebSocketService;
  private readonly SERVER_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3001';

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  connect() {
    if (!this.socket) {
      this.socket = io(this.SERVER_URL);
      this.setupErrorHandling();
    }
  }

  private setupErrorHandling() {
    if (!this.socket) return;

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  generateClassCode(professorId: string, className: string) {
    if (this.socket) {
      this.socket.emit('generateClassCode', { professorId, className });
    }
  }

  validateClassCode(code: string) {
    if (this.socket) {
      this.socket.emit('validateClassCode', { code });
    }
  }

  joinClass(sessionCode: string, userId: string, isProfessor: boolean) {
    if (this.socket) {
      this.socket.emit('joinClass', { sessionCode, userId, isProfessor });
    }
  }

  createQuestion(sessionCode: string, question: Partial<Question>) {
    if (this.socket) {
      this.socket.emit('createQuestion', { sessionCode, question });
    }
  }

  endQuestion(sessionCode: string) {
    if (this.socket) {
      this.socket.emit('endQuestion', { sessionCode });
    }
  }

  onClassCodeGenerated(callback: (data: { code: string; className: string }) => void) {
    if (this.socket) {
      this.socket.on('classCodeGenerated', callback);
    }
  }

  onClassCodeValidated(callback: (data: { isValid: boolean; className?: string }) => void) {
    if (this.socket) {
      this.socket.on('classCodeValidated', callback);
    }
  }

  onQuestionCreated(callback: (question: Question) => void) {
    if (this.socket) {
      this.socket.on('questionCreated', callback);
    }
  }

  onQuestionEnded(callback: () => void) {
    if (this.socket) {
      this.socket.on('questionEnded', callback);
    }
  }

  onSessionUpdate(callback: (data: SessionUpdate) => void) {
    if (this.socket) {
      this.socket.on('sessionUpdate', callback);
    }
  }

  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = WebSocketService.getInstance(); 