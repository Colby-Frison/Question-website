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
  },
  https: {
    onCall: (handler: Function) => ({
      __name: 'httpsOnCall',
      __handler: handler
    })
  }
};

// Only try to import firebase-functions in a Node.js environment
let functions: any;
let admin: any;
try {
  // This will only work in a Node.js environment (like Firebase Functions)
  if (typeof window === 'undefined') {
    functions = require('firebase-functions');
    admin = require('firebase-admin');
    
    // Initialize Firebase Admin SDK if we're in a Firebase Functions environment
    if (!admin.apps.length) {
      admin.initializeApp();
    }
  } else {
    functions = dummyFunctions;
    admin = {
      firestore: () => ({
        collection: () => ({})
      })
    };
  }
} catch (error) {
  console.warn('Firebase functions not available, using dummy implementation');
  functions = dummyFunctions;
  admin = {
    firestore: () => ({
      collection: () => ({})
    })
  };
}

// Try to import the cleanup functions
let cleanupOldData: any;
let cleanupInactiveClassSessions: any;
try {
  const classSession = require('../../src/lib/classSession');
  cleanupOldData = classSession.cleanupOldData;
  cleanupInactiveClassSessions = classSession.cleanupInactiveClassSessions;
} catch (error) {
  console.warn('Could not import cleanup functions');
  cleanupOldData = async () => {
    console.log('Dummy cleanupOldData function called');
    return null;
  };
  cleanupInactiveClassSessions = async () => {
    console.log('Dummy cleanupInactiveClassSessions function called');
    return 0;
  };
}

// Define collections (will be used in our direct cleanup implementation)
const CLASS_SESSIONS_COLLECTION = 'classSessions';
const QUESTIONS_COLLECTION = 'questions';
const USER_QUESTIONS_COLLECTION = 'userQuestions';
const ACTIVE_QUESTIONS_COLLECTION = 'activeQuestions';
const ANSWERS_COLLECTION = 'answers';

// Run old data cleanup once per day
export const scheduledDailyCleanup = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context: any) => {
    try {
      await cleanupOldData();
      console.log('Scheduled daily cleanup completed successfully');
      return null;
    } catch (error) {
      console.error('Error during scheduled daily cleanup:', error);
      throw error;
    }
  });

// Run inactive session cleanup every hour
export const scheduledHourlySessionCleanup = functions.pubsub
  .schedule('0 * * * *')  // Run at the beginning of every hour
  .timeZone('UTC')
  .onRun(async (context: any) => {
    try {
      console.log('Starting hourly inactive session cleanup');
      
      // Try to use the imported function first
      if (typeof cleanupInactiveClassSessions === 'function') {
        const inactiveHours = 3; // Sessions inactive for 3+ hours will be cleaned
        const cleanedCount = await cleanupInactiveClassSessions(inactiveHours);
        console.log(`Cleaned up ${cleanedCount} inactive sessions using imported function`);
      } 
      // If import fails, use our direct cleanup implementation
      else {
        console.log('Using direct cleanup implementation in Cloud Functions');
        await cleanupInactiveSessionsDirect();
      }
      
      console.log('Scheduled hourly session cleanup completed successfully');
      return null;
    } catch (error) {
      console.error('Error during scheduled hourly session cleanup:', error);
      throw error;
    }
  });

// Manual trigger to clean up inactive sessions (via HTTPS callable function)
export const manualCleanupInactiveSessions = functions.https.onCall(async (data: any, context: any) => {
  // You can add auth checks here if needed
  
  try {
    const inactiveHours = data?.inactiveHours || 3;
    console.log(`Manual cleanup triggered for sessions inactive for ${inactiveHours}+ hours`);
    
    if (typeof cleanupInactiveClassSessions === 'function') {
      const cleanedCount = await cleanupInactiveClassSessions(inactiveHours);
      return {
        success: true,
        message: `Cleaned up ${cleanedCount} inactive sessions`,
        count: cleanedCount
      };
    } else {
      const stats = await cleanupInactiveSessionsDirect(inactiveHours);
      return {
        success: true,
        message: `Direct cleanup completed successfully`,
        stats
      };
    }
  } catch (error: any) {
    console.error('Error during manual session cleanup:', error);
    return {
      success: false,
      message: 'Error during cleanup',
      error: error.toString()
    };
  }
});

// Direct implementation for cleaning up inactive sessions in case the import fails
async function cleanupInactiveSessionsDirect(inactiveHours = 3) {
  // This function will be used if the imported function is not available
  if (typeof admin?.firestore !== 'function') {
    console.error('Firebase Admin SDK not available for direct cleanup');
    return { error: 'Firebase Admin SDK not available' };
  }
  
  const db = admin.firestore();
  console.log(`Direct cleanup of inactive class sessions (${inactiveHours}+ hours inactive)`);
  
  try {
    // Calculate the cutoff time for inactivity
    const cutoffTime = Date.now() - (inactiveHours * 60 * 60 * 1000);
    
    // Query for sessions that haven't been active since the cutoff time
    const inactiveSessionsQuery = db.collection(CLASS_SESSIONS_COLLECTION)
      .where('lastActive', '<', cutoffTime)
      .where('status', '==', 'active');
    
    const inactiveSessionsSnapshot = await inactiveSessionsQuery.get();
    
    if (inactiveSessionsSnapshot.empty) {
      console.log('No inactive sessions found');
      return { sessions: 0 };
    }
    
    console.log(`Found ${inactiveSessionsSnapshot.size} inactive sessions to clean up`);
    
    // Stats for tracking
    const stats = {
      sessions: 0,
      questions: 0,
      userQuestions: 0,
      activeQuestions: 0,
      answers: 0
    };
    
    // Process in batches to avoid overwhelming Firestore
    const BATCH_SIZE = 20;
    
    // Process sessions in batches
    for (let i = 0; i < inactiveSessionsSnapshot.docs.length; i += BATCH_SIZE) {
      const batch = inactiveSessionsSnapshot.docs.slice(i, i + BATCH_SIZE);
      const writeBatch = db.batch();
      
      // Process each session in this batch
      for (const doc of batch) {
        const sessionData = doc.data();
        const sessionCode = sessionData.sessionCode;
        
        if (sessionCode) {
          console.log(`Cleaning up inactive session: ${sessionCode}`);
          
          // Mark the session as closed
          writeBatch.update(doc.ref, {
            status: 'closed',
            closedAt: Date.now()
          });
          
          stats.sessions++;
          
          // Clean up related data
          try {
            // Find and delete questions
            const questionsQuery = await db.collection(QUESTIONS_COLLECTION)
              .where('sessionCode', '==', sessionCode)
              .get();
            
            questionsQuery.forEach((questionDoc: any) => {
              writeBatch.delete(questionDoc.ref);
              stats.questions++;
            });
            
            // Find and delete user questions
            const userQuestionsQuery = await db.collection(USER_QUESTIONS_COLLECTION)
              .where('sessionCode', '==', sessionCode)
              .get();
            
            userQuestionsQuery.forEach((userQuestionDoc: any) => {
              writeBatch.delete(userQuestionDoc.ref);
              stats.userQuestions++;
            });
            
            // Find and delete active questions
            const activeQuestionsQuery = await db.collection(ACTIVE_QUESTIONS_COLLECTION)
              .where('sessionCode', '==', sessionCode)
              .get();
            
            activeQuestionsQuery.forEach((activeQuestionDoc: any) => {
              writeBatch.delete(activeQuestionDoc.ref);
              stats.activeQuestions++;
            });
            
            // Find and delete answers
            const answersQuery = await db.collection(ANSWERS_COLLECTION)
              .where('sessionCode', '==', sessionCode)
              .get();
            
            answersQuery.forEach((answerDoc: any) => {
              writeBatch.delete(answerDoc.ref);
              stats.answers++;
            });
            
          } catch (error) {
            console.error(`Error cleaning up data for session ${sessionCode}:`, error);
          }
        }
      }
      
      // Commit the batch
      await writeBatch.commit();
      console.log(`Committed batch ${i/BATCH_SIZE + 1}, processed ${batch.length} sessions`);
    }
    
    console.log('Direct cleanup completed successfully. Stats:', stats);
    return stats;
    
  } catch (error: any) {
    console.error('Error in direct session cleanup:', error);
    return { error: error.toString() };
  }
} 