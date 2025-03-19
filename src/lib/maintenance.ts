/**
 * Database Maintenance Module
 * 
 * This module manages the automatic database maintenance process, which helps keep
 * the database clean, prevents orphaned data, and reduces storage costs.
 * 
 * It provides functionality to:
 * - Set up automatic scheduled maintenance
 * - Force run maintenance tasks on demand
 * - Manage intervals between maintenance runs
 * 
 * The maintenance process includes:
 * - Cleaning up inactive class sessions
 * - Removing orphaned answers (answers to questions that no longer exist)
 */

import { runDatabaseMaintenance } from './questions';

// Interval in milliseconds between maintenance runs (default: 1 hour)
const MAINTENANCE_INTERVAL = 60 * 60 * 1000;

// Minimum interval between maintenance attempts (to prevent excessive runs)
const MIN_MAINTENANCE_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Track the last time maintenance was run
let lastMaintenanceRun = 0;
let maintenanceIntervalId: NodeJS.Timeout | null = null;

/**
 * Sets up automatic maintenance to run periodically
 * 
 * This function sets up a scheduled interval to automatically run
 * database maintenance tasks. It ensures maintenance doesn't run
 * too frequently and avoids setting up duplicate schedules.
 * 
 * @returns A cleanup function to cancel the maintenance interval
 */
export function setupAutomaticMaintenance(): () => void {
  // Only set up maintenance once
  if (maintenanceIntervalId !== null) {
    console.log('Automatic maintenance already set up');
    return () => {
      if (maintenanceIntervalId) {
        clearInterval(maintenanceIntervalId);
        maintenanceIntervalId = null;
      }
    };
  }

  console.log('Setting up automatic database maintenance');
  
  // Run maintenance immediately if it hasn't run recently
  const now = Date.now();
  if (now - lastMaintenanceRun > MIN_MAINTENANCE_INTERVAL) {
    console.log('Running initial maintenance');
    runMaintenanceTask();
  }
  
  // Set up interval for regular maintenance
  maintenanceIntervalId = setInterval(runMaintenanceTask, MAINTENANCE_INTERVAL);
  
  // Return cleanup function
  return () => {
    if (maintenanceIntervalId) {
      console.log('Cleaning up automatic maintenance');
      clearInterval(maintenanceIntervalId);
      maintenanceIntervalId = null;
    }
  };
}

/**
 * Runs the maintenance task and updates the last run timestamp
 * 
 * This internal function handles the actual execution of maintenance tasks,
 * while preventing runs that are too frequent. It also manages the 
 * timestamp tracking for the last maintenance run.
 */
async function runMaintenanceTask() {
  const now = Date.now();
  
  // Prevent running maintenance too frequently
  if (now - lastMaintenanceRun < MIN_MAINTENANCE_INTERVAL) {
    console.log('Skipping maintenance - ran too recently');
    return;
  }
  
  console.log('Running scheduled database maintenance');
  lastMaintenanceRun = now;
  
  try {
    const result = await runDatabaseMaintenance();
    console.log('Scheduled maintenance completed:', result);
  } catch (error) {
    console.error('Error during scheduled maintenance:', error);
  }
}

/**
 * Force runs maintenance immediately, regardless of when it last ran
 * 
 * This function bypasses the minimum interval check and runs
 * maintenance immediately. Useful for manual maintenance triggers
 * or when maintenance needs to be run outside the normal schedule.
 * 
 * @returns The result of the maintenance operation
 */
export async function forceRunMaintenance() {
  console.log('Force running database maintenance');
  lastMaintenanceRun = Date.now();
  
  try {
    return await runDatabaseMaintenance();
  } catch (error) {
    console.error('Error during forced maintenance:', error);
    throw error;
  }
}

/**
 * Manually trigger database maintenance
 * 
 * Legacy function that simply calls runDatabaseMaintenance.
 * Kept for backward compatibility with the maintenance page.
 * New code should use forceRunMaintenance instead.
 * 
 * @returns The result of the maintenance operation
 * @deprecated Use forceRunMaintenance instead
 */
export async function triggerMaintenance(): Promise<{
  inactiveSessionsDeleted: number;
  orphanedAnswersDeleted: number;
}> {
  return await runDatabaseMaintenance();
} 