import * as functions from 'firebase-functions';
import { cleanupOldData } from '../../src/lib/classSession';

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