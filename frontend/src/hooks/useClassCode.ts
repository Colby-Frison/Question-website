import { useState, useCallback, useEffect } from 'react';
import { socketService } from '@/services/websocket';

interface UseClassCodeProps {
  onCodeGenerated?: (code: string, className: string) => void;
  onCodeValidated?: (isValid: boolean, className?: string) => void;
}

export function useClassCode({
  onCodeGenerated,
  onCodeValidated,
}: UseClassCodeProps = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up WebSocket listeners
    if (onCodeGenerated) {
      socketService.onClassCodeGenerated(({ code, className }) => {
        onCodeGenerated(code, className);
        setIsGenerating(false);
      });
    }

    if (onCodeValidated) {
      socketService.onClassCodeValidated(({ isValid, className }) => {
        onCodeValidated(isValid, className);
        setIsValidating(false);
      });
    }

    // Clean up on unmount
    return () => {
      socketService.removeAllListeners();
    };
  }, [onCodeGenerated, onCodeValidated]);

  const generateClassCode = useCallback((professorId: string, className: string) => {
    if (!socketService.isConnected()) {
      setError('Not connected to server');
      return;
    }

    setIsGenerating(true);
    setError(null);
    socketService.generateClassCode(professorId, className);
  }, []);

  const validateClassCode = useCallback((code: string) => {
    if (!socketService.isConnected()) {
      setError('Not connected to server');
      return;
    }

    setIsValidating(true);
    setError(null);
    socketService.validateClassCode(code);
  }, []);

  return {
    generateClassCode,
    validateClassCode,
    isGenerating,
    isValidating,
    error,
  };
} 