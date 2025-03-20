'use client';

/**
 * Firebase Diagnostic Page
 * 
 * This page provides tools to diagnose issues with Firebase connectivity
 * and data access. It's a useful tool for troubleshooting when the main
 * application pages aren't functioning correctly.
 */

import { useState, useEffect } from 'react';
import { runFirebaseDiagnostics, DiagnosticResult } from '@/lib/firebase-diagnostic';
import { checkFirebaseConnection } from '@/lib/firebase';
import { getUserId, isStudent, isProfessor } from '@/lib/auth';
import { getJoinedClass } from '@/lib/classCode';

export default function DiagnosticPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [userId, setUserId] = useState('');
  const [userType, setUserType] = useState('');
  const [joinedClass, setJoinedClass] = useState<any>(null);
  const [basicConnectionStatus, setBasicConnectionStatus] = useState<boolean | null>(null);
  
  useEffect(() => {
    // Check and set user information
    const id = getUserId();
    setUserId(id);
    
    let type = 'unknown';
    if (isStudent()) {
      type = 'student';
    } else if (isProfessor()) {
      type = 'professor';
    }
    setUserType(type);
    
    // Check basic Firebase connection
    checkFirebaseConnection()
      .then(connected => {
        setBasicConnectionStatus(connected);
      })
      .catch(error => {
        console.error("Error checking Firebase connection:", error);
        setBasicConnectionStatus(false);
      });
  }, []);
  
  const handleRunDiagnostics = async () => {
    setIsLoading(true);
    try {
      const diagnosticResults = await runFirebaseDiagnostics();
      setResults(diagnosticResults);
      
      // If we have a user ID and they're a student, check joined class
      if (userId && userType === 'student') {
        try {
          const classData = await getJoinedClass(userId);
          setJoinedClass(classData);
          if (classData?.sessionCode) {
            setSessionCode(classData.sessionCode);
          }
        } catch (error) {
          console.error("Error checking joined class:", error);
        }
      }
    } catch (error) {
      console.error("Error running diagnostics:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSessionCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSessionCode(e.target.value);
  };
  
  // Save to session storage for other pages
  const handleSaveSessionCode = () => {
    if (sessionCode) {
      localStorage.setItem('lastSessionCode', sessionCode);
      alert(`Saved session code: ${sessionCode} to local storage`);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6">Firebase Diagnostic Page</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">User Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-medium">User ID:</p>
            <p className="font-mono bg-gray-100 p-2 rounded dark:bg-gray-700">{userId || 'Not found'}</p>
          </div>
          <div>
            <p className="font-medium">User Type:</p>
            <p className="font-mono bg-gray-100 p-2 rounded dark:bg-gray-700">{userType}</p>
          </div>
          {joinedClass && (
            <>
              <div>
                <p className="font-medium">Joined Class:</p>
                <p className="font-mono bg-gray-100 p-2 rounded dark:bg-gray-700">{joinedClass.className || 'N/A'}</p>
              </div>
              <div>
                <p className="font-medium">Session Code:</p>
                <p className="font-mono bg-gray-100 p-2 rounded dark:bg-gray-700">{joinedClass.sessionCode || 'N/A'}</p>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Basic Firebase Connection</h2>
        <div className="flex items-center mb-4">
          <div className={`w-4 h-4 rounded-full mr-2 ${
            basicConnectionStatus === null 
              ? 'bg-gray-400' 
              : basicConnectionStatus 
                ? 'bg-green-500' 
                : 'bg-red-500'
          }`}></div>
          <p>{
            basicConnectionStatus === null 
              ? 'Checking connection...' 
              : basicConnectionStatus 
                ? 'Basic Firebase connection successful' 
                : 'Basic Firebase connection failed'
          }</p>
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Session Code Testing</h2>
        <div className="flex mb-4">
          <input
            type="text"
            value={sessionCode}
            onChange={handleSessionCodeChange}
            placeholder="Enter session code"
            className="p-2 border rounded w-full mr-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <button
            onClick={handleSaveSessionCode}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
          >
            Save
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter a session code to test and save it for diagnostics
        </p>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Detailed Diagnostics</h2>
        <button
          onClick={handleRunDiagnostics}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 mb-4"
          disabled={isLoading}
        >
          {isLoading ? 'Running...' : 'Run Full Diagnostics'}
        </button>
        
        {results.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Results:</h3>
            {results.map((result, index) => (
              <div 
                key={index} 
                className={`mb-4 p-4 rounded ${
                  result.success ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'
                }`}
              >
                <p className="font-bold">{result.stage}</p>
                <p className="mb-2">{result.message}</p>
                {result.error && (
                  <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-sm font-mono overflow-auto dark:bg-gray-800">
                    {typeof result.error === 'object' 
                      ? JSON.stringify(result.error, null, 2) 
                      : String(result.error)}
                  </pre>
                )}
                {result.data && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">View Data</summary>
                    <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-sm font-mono mt-2 overflow-auto dark:bg-gray-800">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Troubleshooting Steps</h2>
        <ul className="list-disc pl-6">
          <li className="mb-2">Make sure your browser is not blocking cookies or localStorage</li>
          <li className="mb-2">Check if you have a network connection and can access other websites</li>
          <li className="mb-2">Try clearing your browser cache and cookies</li>
          <li className="mb-2">Verify that the Firebase project is correctly configured and accessible</li>
          <li className="mb-2">Check that you have the correct session code if joining a class</li>
        </ul>
      </div>
      
      <div className="text-center mt-8">
        <button
          onClick={() => window.location.href = '/'}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
} 