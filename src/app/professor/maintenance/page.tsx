'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { clearUserType, isProfessor, getUserId } from '@/lib/auth';
import { forceRunMaintenance } from '@/lib/maintenance';

export default function MaintenancePage() {
  const router = useRouter();
  const [professorId, setProfessorId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    inactiveSessionsDeleted?: number;
    orphanedAnswersDeleted?: number;
    timestamp?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is a professor
    if (!isProfessor()) {
      router.push('/');
      return;
    }

    const userId = getUserId();
    setProfessorId(userId);
  }, [router]);

  const handleLogout = () => {
    clearUserType();
    router.push('/');
  };

  const handleRunMaintenance = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      const result = await forceRunMaintenance();
      setResults({
        ...result,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error running maintenance:', error);
      setError('Failed to run maintenance tasks. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCleanupSessions = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      // Use the forceRunMaintenance function but only show session results
      const result = await forceRunMaintenance();
      setResults({
        inactiveSessionsDeleted: result.inactiveSessionsDeleted,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      setError('Failed to clean up inactive sessions. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCleanupAnswers = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      // Use the forceRunMaintenance function but only show answers results
      const result = await forceRunMaintenance();
      setResults({
        orphanedAnswersDeleted: result.orphanedAnswersDeleted,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error cleaning up answers:', error);
      setError('Failed to clean up orphaned answers. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <Navbar userType="professor" onLogout={handleLogout} />
      
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-text dark:text-dark-text">Database Maintenance</h1>
            <p className="mt-2 text-text-secondary dark:text-dark-text-secondary">
              Run maintenance tasks to clean up unused data in the database.
            </p>
          </div>
          
          {error && (
            <div className="mb-6 rounded-lg bg-error-light/20 p-4 dark:bg-error-light/10">
              <p className="text-error-dark dark:text-error-light">{error}</p>
            </div>
          )}
          
          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 dark:bg-dark-background-secondary">
              <h2 className="text-xl font-semibold text-text dark:text-dark-text">Run All Maintenance Tasks</h2>
              <p className="mt-2 text-text-secondary dark:text-dark-text-secondary">
                This will clean up inactive class sessions and orphaned answers.
              </p>
              <p className="mt-2 text-text-secondary dark:text-dark-text-secondary">
                <strong>Note:</strong> Maintenance also runs automatically every hour in the background.
              </p>
              <button
                onClick={handleRunMaintenance}
                disabled={isRunning}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:bg-dark-primary dark:hover:bg-dark-primary-light dark:focus:ring-dark-primary disabled:opacity-50"
              >
                {isRunning ? 'Running...' : 'Run All Tasks Now'}
              </button>
            </div>
            
            {results && (
              <div className="rounded-lg bg-success-light/10 p-6 dark:bg-success-light/5">
                <h2 className="text-lg font-semibold text-success-dark dark:text-success-light">Maintenance Results</h2>
                <p className="mt-2 text-success-dark dark:text-success-light">
                  Maintenance completed at {new Date(results.timestamp || Date.now()).toLocaleString()}
                </p>
                <ul className="mt-2 space-y-1 text-success-dark dark:text-success-light">
                  {results.inactiveSessionsDeleted !== undefined && (
                    <li>• {results.inactiveSessionsDeleted} inactive class sessions deleted</li>
                  )}
                  {results.orphanedAnswersDeleted !== undefined && (
                    <li>• {results.orphanedAnswersDeleted} orphaned answers deleted</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          <div className="mt-8 text-center">
            <button
              onClick={() => router.push('/professor')}
              className="text-text-secondary dark:text-dark-text-secondary hover:text-text dark:hover:text-dark-text"
            >
              ← Back to Professor Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
} 