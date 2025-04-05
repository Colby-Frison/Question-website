import { useEffect, useCallback } from 'react';
import { socketService } from '@/lib/websocket';

interface UseWebSocketProps {
  onQuestionUpdate?: (question: any) => void;
  onAnswerUpdate?: (answer: any) => void;
  onSessionUpdate?: (session: any) => void;
}

export const useWebSocket = ({
  onQuestionUpdate,
  onAnswerUpdate,
  onSessionUpdate
}: UseWebSocketProps = {}) => {
  useEffect(() => {
    if (onQuestionUpdate) {
      socketService.onQuestionUpdate(onQuestionUpdate);
    }
    if (onAnswerUpdate) {
      socketService.onAnswerUpdate(onAnswerUpdate);
    }
    if (onSessionUpdate) {
      socketService.onSessionUpdate(onSessionUpdate);
    }

    return () => {
      if (onQuestionUpdate) {
        socketService.offQuestionUpdate();
      }
      if (onAnswerUpdate) {
        socketService.offAnswerUpdate();
      }
      if (onSessionUpdate) {
        socketService.offSessionUpdate();
      }
    };
  }, [onQuestionUpdate, onAnswerUpdate, onSessionUpdate]);

  const sendQuestion = useCallback((question: any) => {
    socketService.sendQuestion(question);
  }, []);

  const sendAnswer = useCallback((answer: any) => {
    socketService.sendAnswer(answer);
  }, []);

  const joinSession = useCallback((sessionId: string) => {
    socketService.joinSession(sessionId);
  }, []);

  return {
    sendQuestion,
    sendAnswer,
    joinSession
  };
}; 