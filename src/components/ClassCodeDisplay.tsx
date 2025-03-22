'use client';

import { useState } from 'react';
import { validateClassName, formatClassName, createClass } from '@/lib/classCode';

/**
 * Interface for the ClassNameDisplay component props
 * @interface ClassNameDisplayProps
 * @property {string} className - The current class name being displayed
 * @property {function} [onClassNameChange] - Optional callback function when the class name changes
 */
interface ClassNameDisplayProps {
  className: string;
  onClassNameChange?: (newClassName: string) => void;
}

/**
 * Component for displaying and managing class names for professors
 * 
 * This component allows professors to:
 * - Create a new class with a validated name
 * - View their current class name
 * - Edit their class name (when no active session is running)
 * 
 * @param {ClassNameDisplayProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function ClassNameDisplay({ 
  className, 
  onClassNameChange 
}: ClassNameDisplayProps) {
  const [newClassName, setNewClassName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  /**
   * Handles the creation/update of a class
   * - Validates and formats the class name
   * - Creates/updates the class in the state
   * - Updates the UI with the new class name
   * @async
   */
  const handleUpdateClass = async () => {
    // Clear previous errors
    setError('');
    
    // Validate class name
    const formattedName = formatClassName(newClassName);
    if (!validateClassName(formattedName)) {
      setError('Class name must be 3-30 characters and contain only letters, numbers, and spaces.');
      return;
    }
    
    setIsCreating(true);
    
    try {
      if (onClassNameChange) {
        onClassNameChange(formattedName);
      }
      setNewClassName('');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating class:', error);
      setError('Failed to update class. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Your Class</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <div className="flex flex-col space-y-4">
        {!className || isEditing ? (
          <div className="flex flex-col space-y-4">
            <div className="flex-1">
              <label htmlFor="className" className="block text-sm font-medium text-gray-700 mb-1">
                {!className ? 'Create a Class Name' : 'Update Class Name'}
              </label>
              <input
                type="text"
                id="className"
                className="w-full p-2 border rounded"
                placeholder="e.g. Math 101"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                maxLength={30}
              />
              <p className="mt-1 text-xs text-gray-500">
                Class name must be 3-30 characters and can contain letters, numbers, and spaces.
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleUpdateClass}
                disabled={isCreating || !newClassName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Saving...' : !className ? 'Create Class' : 'Update Class'}
              </button>
              {isEditing && (
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-blue-50 rounded font-medium text-lg">
                {className}
              </div>
              <button
                onClick={() => {
                  setNewClassName(className);
                  setIsEditing(true);
                }}
                className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Edit
              </button>
            </div>
            
            <p className="text-sm text-gray-500">
              This is your class name. When you start a session, students will use the session code to join.
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 