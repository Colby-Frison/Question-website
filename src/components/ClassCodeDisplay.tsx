'use client';

import { useState } from 'react';
import { generateClassCode, createClassCode } from '@/lib/classCode';

interface ClassCodeDisplayProps {
  classCode: string;
  professorId: string;
  onCodeChange: (newCode: string) => void;
}

export default function ClassCodeDisplay({ 
  classCode, 
  professorId,
  onCodeChange 
}: ClassCodeDisplayProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleRegenerateCode = async () => {
    setIsGenerating(true);
    
    try {
      const newCode = generateClassCode();
      const success = await createClassCode(newCode, professorId);
      
      if (success) {
        onCodeChange(newCode);
      }
    } catch (error) {
      console.error('Error regenerating class code:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">Class Code</h2>
      <div className="flex items-center space-x-4">
        <div className="rounded-md bg-gray-100 px-4 py-2 text-lg font-mono font-bold">
          {classCode || 'No code generated yet'}
        </div>
        <button
          onClick={handleRegenerateCode}
          disabled={isGenerating}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-blue-400"
        >
          {isGenerating ? 'Generating...' : 'Generate New Code'}
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Share this code with your students so they can join your class.
      </p>
    </div>
  );
} 