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

// Function to manually trigger maintenance
export async function triggerMaintenance(): Promise<{
  inactiveSessionsDeleted: number;
  orphanedAnswersDeleted: number;
}> {
  return await runDatabaseMaintenance();
} 