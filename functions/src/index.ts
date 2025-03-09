import * as functions from 'firebase-functions';
// Import the function directly or use a try-catch to handle potential import errors
try {
  const { cleanupOldData } = require('../../src/lib/classSession');

  // Run cleanup every day at midnight
  export const scheduledCleanup = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('UTC')
    .onRun(async (context) => {
      try {
        await cleanupOldData();
        console.log('Scheduled cleanup completed successfully');
        return null;
      } catch (error) {
        console.error('Error during scheduled cleanup:', error);
        throw error;
      }
    });
} catch (error) {
  console.error('Error loading cleanupOldData function:', error);
  // Provide a fallback implementation or just export a dummy function
  export const scheduledCleanup = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('UTC')
    .onRun(async () => {
      console.log('Cleanup function not available');
      return null;
    });
} 