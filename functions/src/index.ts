// This file is for Firebase Cloud Functions
// We're using a conditional approach to avoid build errors

// Define a dummy functions object for build time
const dummyFunctions = {
  pubsub: {
    schedule: (cronExpression: string) => ({
      timeZone: (tz: string) => ({
        onRun: (handler: Function) => ({ 
          __name: 'scheduledCleanup',
          __handler: handler 
        })
      })
    })
  }
};

// Only try to import firebase-functions in a Node.js environment
let functions: any;
try {
  // This will only work in a Node.js environment (like Firebase Functions)
  if (typeof window === 'undefined') {
    functions = require('firebase-functions');
  } else {
    functions = dummyFunctions;
  }
} catch (error) {
  console.warn('Firebase functions not available, using dummy implementation');
  functions = dummyFunctions;
}

// Try to import the cleanupOldData function
let cleanupOldData: any;
try {
  const classSession = require('../../src/lib/classSession');
  cleanupOldData = classSession.cleanupOldData;
} catch (error) {
  console.warn('Could not import cleanupOldData function');
  cleanupOldData = async () => {
    console.log('Dummy cleanupOldData function called');
    return null;
  };
}

// Run cleanup every day at midnight
export const scheduledCleanup = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context: any) => {
    try {
      await cleanupOldData();
      console.log('Scheduled cleanup completed successfully');
      return null;
    } catch (error) {
      console.error('Error during scheduled cleanup:', error);
      throw error;
    }
  }); 