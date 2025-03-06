'use client';

import { generateClassCode, setClassCode } from '@/lib/classCode';

interface ClassCodeDisplayProps {
  classCode: string;
}

export default function ClassCodeDisplay({ classCode }: ClassCodeDisplayProps) {
  const handleRegenerateCode = () => {
    const newCode = generateClassCode();
    setClassCode(newCode);
    window.location.reload(); // Refresh to show the new code
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">Class Code</h2>
      <div className="flex items-center space-x-4">
        <div className="rounded-md bg-gray-100 px-4 py-2 text-lg font-mono font-bold">
          {classCode}
        </div>
        <button
          onClick={handleRegenerateCode}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate New Code
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Share this code with your students so they can join your class.
      </p>
    </div>
  );
} 