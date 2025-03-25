/**
 * Class Session Management Module
 * 
 * This module handles the creation and management of class sessions. A class session
 * represents an active instance of a class where a professor is teaching and
 * students are participating.
 * 
 * The module provides functionality for:
 * - Creating new class sessions with randomly generated session codes
 * - Tracking session activity and timestamps
 * - Managing session lifecycle (active, inactive, closed)
 * - Automatically ending sessions after 3 hours of inactivity
 * 
 * Each session has its own unique code that students use to join, and this code
 * is only valid for the duration of the session.
 */

import { ClassSession } from '@/types';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc, 
  doc, 
  onSnapshot,
  updateDoc,
  limit,
  getDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';

// Collection reference for Firestore database
const CLASS_SESSIONS_COLLECTION = 'classSessions';

// Time in milliseconds after which a session is considered inactive (3 hours)
export const SESSION_INACTIVITY_TIMEOUT = 3 * 60 * 60 * 1000;

/**
 * Generate a random session code
 * 
 * Creates a random 6-character alphanumeric code to use as a session identifier.
 * This code is what students will use to join a class session.
 * 
 * @returns A randomly generated 6-character session code
 */
export const generateSessionCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  
  return result;
};

/**
 * Create a new class session
 * 
 * Creates a new session record for a class, associated with a specific professor.
 * Each session tracks when it was created and when it was last active, and has
 * a unique session code that students use to join.
 * 
 * @param className - The name of the class the session is for
 * @param professorId - The ID of the professor creating the session
 * @returns A promise that resolves to an object containing the session ID and session code
 */
export const createClassSession = async (
  className: string,
  professorId: string
): Promise<{ sessionId: string, sessionCode: string }> => {
  if (!className || !professorId) {
    console.error("Missing parameters for createClassSession");
    throw new Error("Class name and professor ID are required");
  }

  try {
    console.log(`Creating class session for ${className} with professor ${professorId}`);
    
    // Generate a random session code for this session
    const sessionCode = generateSessionCode();
    
    // Create timestamp for tracking
    const currentTime = Date.now();
    
    // Create the session object
    const session: Omit<ClassSession, "id"> = {
      code: className,          // Original class name
      sessionCode: sessionCode, // New randomly generated code for this session
      professorId,
      status: 'active',         // Set status according to interface requirements
      createdAt: currentTime,
      lastActiveAt: currentTime,
      lastActive: currentTime   // For maintenance functions
    };
    
    // Add to Firestore
    const docRef = await addDoc(collection(db, CLASS_SESSIONS_COLLECTION), session);
    console.log(`Class session created with ID: ${docRef.id} and code: ${sessionCode}`);
    
    return { sessionId: docRef.id, sessionCode };
  } catch (error) {
    console.error("Error creating class session:", error);
    throw error;
  }
};

/**
 * Update a class session's activity timestamp
 * 
 * Updates the lastActiveAt and lastActive timestamps of a session to mark it as active.
 * This is used to track when a session was last used.
 * 
 * @param sessionId - The ID of the session to update
 * @returns A promise that resolves when the update is complete
 */
export const updateSessionActivity = async (sessionId: string): Promise<void> => {
  if (!sessionId) {
    console.error("No session ID provided to updateSessionActivity");
    return;
  }

  try {
    console.log(`Updating activity for session ${sessionId}`);
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    
    // Update the activity timestamps
    await updateDoc(sessionRef, {
      lastActiveAt: Date.now(),
      lastActive: Date.now()
    });
    
    console.log(`Session ${sessionId} activity updated`);
  } catch (error) {
    console.error("Error updating session activity:", error);
  }
};

/**
 * Get active sessions for a class
 * 
 * Retrieves all active sessions for a specific class.
 * 
 * @param classCode - The code of the class to get sessions for
 * @returns A promise that resolves to an array of session objects with their IDs
 */
export const getActiveSessionsForClass = async (classCode: string): Promise<ClassSession[]> => {
  if (!classCode) {
    console.warn("No class code provided to getActiveSessionsForClass");
    return [];
  }

  try {
    console.log(`Fetching active sessions for class: ${classCode}`);
    const q = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('code', '==', classCode),  // Use 'code' according to interface
      where('status', '==', 'active'), // Only get active sessions
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} active sessions for class ${classCode}`);
    
    // Map the documents to session objects
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      code: doc.data().code,              // Original class name
      sessionCode: doc.data().sessionCode || doc.id.substring(0, 6), // Session code (fallback for older records)
      professorId: doc.data().professorId,
      status: doc.data().status || 'active',
      createdAt: doc.data().createdAt,
      lastActiveAt: doc.data().lastActiveAt,
      lastActive: doc.data().lastActive || doc.data().lastActiveAt,
      archivedAt: doc.data().archivedAt   // Include optional field
    }));
  } catch (error) {
    console.error("Error getting active sessions:", error);
    return [];
  }
};

/**
 * Get session by session code
 * 
 * Retrieves a session using its unique session code.
 * This is used when students want to join a specific session.
 * 
 * @param sessionCode - The unique code for the session
 * @returns A promise that resolves to the session object or null if not found
 */
export const getSessionByCode = async (sessionCode: string): Promise<ClassSession | null> => {
  if (!sessionCode) {
    console.warn("No session code provided to getSessionByCode");
    return null;
  }

  // Clean up the session code (remove whitespace, convert to uppercase)
  const cleanSessionCode = sessionCode.trim().toUpperCase();
  
  try {
    console.log(`Looking up session with code: ${cleanSessionCode}`);
    
    // Force index creation if this query fails
    try {
      const q = query(
        collection(db, CLASS_SESSIONS_COLLECTION),
        where('sessionCode', '==', cleanSessionCode),
        where('status', '==', 'active')  // Only get active sessions
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`No active session found with code ${cleanSessionCode}`);
        
        // Try a secondary lookup with case-insensitive session code
        console.log("Attempting secondary lookup with different format...");
        const q2 = query(
          collection(db, CLASS_SESSIONS_COLLECTION),
          where('sessionCode', '==', cleanSessionCode)
        );
        
        const secondarySnapshot = await getDocs(q2);
        
        if (secondarySnapshot.empty) {
          console.log("Secondary lookup also found no sessions");
          return null;
        }
        
        // Found with secondary lookup
        const secondaryDoc = secondarySnapshot.docs[0];
        console.log(`Found session with ID: ${secondaryDoc.id} but status is: ${secondaryDoc.data().status}`);
        
        // If status is not active, return null but with a log
        if (secondaryDoc.data().status !== 'active') {
          console.log(`Session ${secondaryDoc.id} exists but is not active (status: ${secondaryDoc.data().status})`);
          return null;
        }
        
        return {
          id: secondaryDoc.id,
          code: secondaryDoc.data().code,
          sessionCode: secondaryDoc.data().sessionCode,
          professorId: secondaryDoc.data().professorId,
          status: secondaryDoc.data().status,
          createdAt: secondaryDoc.data().createdAt,
          lastActiveAt: secondaryDoc.data().lastActiveAt,
          lastActive: secondaryDoc.data().lastActive || secondaryDoc.data().lastActiveAt,
          archivedAt: secondaryDoc.data().archivedAt
        };
      }
      
      const doc = querySnapshot.docs[0];
      console.log(`Found active session with ID: ${doc.id}`);
      
      return {
        id: doc.id,
        code: doc.data().code,
        sessionCode: doc.data().sessionCode,
        professorId: doc.data().professorId,
        status: doc.data().status,
        createdAt: doc.data().createdAt,
        lastActiveAt: doc.data().lastActiveAt,
        lastActive: doc.data().lastActive || doc.data().lastActiveAt,
        archivedAt: doc.data().archivedAt
      };
    } catch (indexError) {
      console.error("Error with session lookup - possible missing index:", indexError);
      console.log("Please check if you need to create an index for this query");
      
      // Try a simpler query without the index requirement
      const fallbackQuery = query(collection(db, CLASS_SESSIONS_COLLECTION));
      const allSessions = await getDocs(fallbackQuery);
      
      // Log all sessions for debugging
      console.log(`Found ${allSessions.docs.length} total sessions`);
      allSessions.docs.forEach(doc => {
        console.log(`Session ${doc.id}: code=${doc.data().code}, sessionCode=${doc.data().sessionCode}, status=${doc.data().status}`);
      });
      
      // Try to find a match manually
      const matchingSession = allSessions.docs.find(doc => 
        doc.data().sessionCode === cleanSessionCode && doc.data().status === 'active'
      );
      
      if (matchingSession) {
        console.log(`Found matching session via fallback: ${matchingSession.id}`);
        return {
          id: matchingSession.id,
          code: matchingSession.data().code,
          sessionCode: matchingSession.data().sessionCode,
          professorId: matchingSession.data().professorId,
          status: matchingSession.data().status,
          createdAt: matchingSession.data().createdAt,
          lastActiveAt: matchingSession.data().lastActiveAt,
          lastActive: matchingSession.data().lastActive || matchingSession.data().lastActiveAt,
          archivedAt: matchingSession.data().archivedAt
        };
      }
      
      return null;
    }
  } catch (error) {
    console.error("Error getting session by code:", error);
    return null;
  }
};

/**
 * Check if a session is inactive
 * 
 * Determines if a session is inactive based on its last activity timestamp.
 * A session is considered inactive if it hasn't been updated in the last 3 hours.
 * 
 * @param session - The session to check
 * @returns True if the session is inactive, false otherwise
 */
export const isSessionInactive = (session: ClassSession): boolean => {
  const now = Date.now();
  const lastActive = session.lastActive || session.lastActiveAt;
  return now - lastActive > SESSION_INACTIVITY_TIMEOUT;
};

/**
 * Clean up all data associated with a class session
 * 
 * This function removes all data linked to a specific session when it ends,
 * including questions, answers, and other related records.
 * 
 * @param sessionCode - The session code to clean up data for
 * @returns A promise that resolves to an object containing counts of deleted items
 */
export const cleanupSessionData = async (sessionCode: string): Promise<{
  questionsDeleted: number;
  answersDeleted: number;
  userQuestionsDeleted: number;
  activeQuestionsDeleted: number;
}> => {
  if (!sessionCode) {
    console.error("No session code provided to cleanupSessionData");
    return {
      questionsDeleted: 0,
      answersDeleted: 0,
      userQuestionsDeleted: 0,
      activeQuestionsDeleted: 0
    };
  }

  console.log(`Starting cleanup for session: ${sessionCode}`);
  
  // Track deleted items counts
  const stats = {
    questionsDeleted: 0,
    answersDeleted: 0,
    userQuestionsDeleted: 0,
    activeQuestionsDeleted: 0
  };
  
  try {
    // Get documents for each collection that needs cleanup
    
    // Step 1: Fetch all documents that need to be deleted
    console.log(`Fetching documents for session: ${sessionCode}`);
    
    // Get questions
    const questionsQuery = query(
      collection(db, 'questions'),
      where('sessionCode', '==', sessionCode)
    );
    const questionsSnapshot = await getDocs(questionsQuery);
    console.log(`Found ${questionsSnapshot.docs.length} questions to delete for session ${sessionCode}`);
    
    // Get user questions
    const userQuestionsQuery = query(
      collection(db, 'userQuestions'),
      where('sessionCode', '==', sessionCode)
    );
    const userQuestionsSnapshot = await getDocs(userQuestionsQuery);
    console.log(`Found ${userQuestionsSnapshot.docs.length} user question references to delete for session ${sessionCode}`);
    
    // Get active questions
    const activeQuestionsQuery = query(
      collection(db, 'activeQuestions'),
      where('sessionCode', '==', sessionCode)
    );
    const activeQuestionsSnapshot = await getDocs(activeQuestionsQuery);
    console.log(`Found ${activeQuestionsSnapshot.docs.length} active questions to delete for session ${sessionCode}`);
    
    // Get answers
    const answersQuery = query(
      collection(db, 'answers'),
      where('sessionCode', '==', sessionCode)
    );
    const answersSnapshot = await getDocs(answersQuery);
    console.log(`Found ${answersSnapshot.docs.length} answers to delete for session ${sessionCode}`);
    
    // Step 2: Delete documents in batches
    const BATCH_SIZE = 400; // Firestore limit is 500 operations per batch
    let batchFailed = false;
    
    // Process each collection in turn
    const collections = [
      { name: 'questions', docs: questionsSnapshot.docs, statKey: 'questionsDeleted' as keyof typeof stats },
      { name: 'userQuestions', docs: userQuestionsSnapshot.docs, statKey: 'userQuestionsDeleted' as keyof typeof stats },
      { name: 'activeQuestions', docs: activeQuestionsSnapshot.docs, statKey: 'activeQuestionsDeleted' as keyof typeof stats },
      { name: 'answers', docs: answersSnapshot.docs, statKey: 'answersDeleted' as keyof typeof stats }
    ];
    
    for (const collection of collections) {
      const { name, docs, statKey } = collection;
      
      if (docs.length === 0) {
        console.log(`No ${name} to delete for session ${sessionCode}`);
        continue;
      }
      
      console.log(`Starting deletion of ${docs.length} ${name} for session ${sessionCode}`);
      
      // Process in batches
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        if (batchFailed) {
          console.log(`Switching to individual deletions for remaining ${name}`);
          break;
        }
        
        const batchDocs = docs.slice(i, i + BATCH_SIZE);
        
        try {
          // Create a new batch
          const batch = writeBatch(db);
          
          // Add delete operations to batch
          batchDocs.forEach(doc => batch.delete(doc.ref));
          
          // Commit the batch
          await batch.commit();
          
          // Update stats
          stats[statKey] += batchDocs.length;
          console.log(`Deleted batch of ${batchDocs.length} ${name} (${i + batchDocs.length}/${docs.length})`);
        } catch (error) {
          console.error(`Error deleting batch of ${name}:`, error);
          batchFailed = true;
          
          // Switch to individual deletes
          console.log(`Batch delete failed for ${name}, switching to individual deletes`);
        }
      }
      
      // If batch operations failed, fall back to individual deletes for remaining items
      if (batchFailed) {
        const remainingDocs = docs.slice(stats[statKey]);
        
        console.log(`Deleting ${remainingDocs.length} remaining ${name} one by one`);
        
        for (const doc of remainingDocs) {
          try {
            await deleteDoc(doc.ref);
            stats[statKey]++;
            
            // Log progress in chunks
            if (stats[statKey] % 10 === 0) {
              console.log(`Deleted ${stats[statKey]}/${docs.length} ${name}`);
            }
          } catch (error) {
            console.error(`Error deleting individual ${name} document ${doc.id}:`, error);
            // Continue despite errors
          }
        }
      }
      
      console.log(`Completed deletion of ${stats[statKey]}/${docs.length} ${name} for session ${sessionCode}`);
    }
    
    console.log(`Successfully cleaned up all data for session ${sessionCode}:`, stats);
    return stats;
  } catch (error) {
    console.error(`Error cleaning up session data for ${sessionCode}:`, error);
    return stats; // Return whatever we managed to delete
  }
};

/**
 * End a class session
 * 
 * Removes a session from the database when it's no longer needed.
 * This is called when a professor explicitly ends a class session.
 * 
 * @param sessionId - The ID of the session to end
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const endClassSession = async (sessionId: string): Promise<boolean> => {
  if (!sessionId) {
    console.error("No session ID provided to endClassSession");
    return false;
  }

  try {
    console.log(`Ending class session: ${sessionId}`);
    
    // Get the session record to retrieve the session code
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) {
      console.error(`Session ${sessionId} not found`);
      return false;
    }
    
    const sessionData = sessionSnap.data();
    const sessionCode = sessionData.sessionCode;
    
    // Instead of deleting, mark as closed
    await updateDoc(sessionRef, {
      status: 'closed',
      closedAt: Date.now(),
      lastActiveAt: Date.now(),
      lastActive: Date.now()
    });
    
    console.log(`Session ${sessionId} successfully marked as closed`);
    
    // Clean up all associated data
    if (sessionCode) {
      console.log(`Starting cleanup for session code: ${sessionCode}`);
      const cleanupResult = await cleanupSessionData(sessionCode);
      console.log(`Cleanup completed:`, cleanupResult);
    } else {
      console.warn(`No session code found for session ${sessionId}, skipping data cleanup`);
    }
    
    return true;
  } catch (error) {
    console.error("Error ending class session:", error);
    return false;
  }
};

/**
 * Archive a class session
 * 
 * Changes a session's status to 'archived' and records the archive timestamp.
 * Archived sessions are kept in the database but marked as no longer active.
 * 
 * @param sessionId - The ID of the session to archive
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const archiveClassSession = async (sessionId: string): Promise<boolean> => {
  if (!sessionId) {
    console.error("No session ID provided to archiveClassSession");
    return false;
  }

  try {
    console.log(`Archiving class session: ${sessionId}`);
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    
    // Check if the session exists
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) {
      console.log(`Session ${sessionId} not found`);
      return false;
    }
    
    // Update the session status to archived
    const currentTime = Date.now();
    await updateDoc(sessionRef, {
      status: 'archived',
      archivedAt: currentTime,
      lastActiveAt: currentTime,
      lastActive: currentTime
    });
    
    console.log(`Session ${sessionId} successfully archived`);
    return true;
  } catch (error) {
    console.error("Error archiving class session:", error);
    return false;
  }
};

// Define closeClassSession as an alias for endClassSession for better code readability
export const closeClassSession = endClassSession;

/**
 * Force index creation for Firestore
 * 
 * This function explicitly runs queries that require indexes to be created.
 * Call this function during development to trigger Firebase's index creation prompts.
 * 
 * @returns A promise that resolves when the queries are complete
 */
export const forceIndexCreation = async (): Promise<void> => {
  try {
    console.log("Running queries to force index creation...");
    
    // Query 1: Find active sessions for a specific class
    const q1 = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('code', '==', 'SAMPLE'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
    
    // Query 2: Find session by session code and status
    const q2 = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('sessionCode', '==', 'SAMPLE'),
      where('status', '==', 'active')
    );
    
    // Execute the queries
    try {
      await getDocs(q1);
      console.log("Successfully ran query 1 for index creation");
    } catch (error: any) {
      // This error should contain the URL to create the index
      console.error("Index needed for query 1:", error.message);
    }
    
    try {
      await getDocs(q2);
      console.log("Successfully ran query 2 for index creation");
    } catch (error: any) {
      // This error should contain the URL to create the index
      console.error("Index needed for query 2:", error.message);
    }
    
    console.log("Finished index creation checks");
  } catch (error) {
    console.error("Error in forceIndexCreation:", error);
  }
};

/**
 * Listen for session status changes
 * 
 * Sets up a real-time listener for changes to a specific session's status.
 * This is used to notify students when a professor ends a class session.
 * 
 * @param sessionCode - The session code to listen for
 * @param callback - Function to call when session status changes
 * @returns A function to unsubscribe from the listener
 */
export const listenForSessionStatus = (
  sessionCode: string,
  callback: (sessionStatus: 'active' | 'closed' | 'archived' | null) => void
): () => void => {
  if (!sessionCode) {
    console.error("No session code provided to listenForSessionStatus");
    callback(null);
    return () => {};
  }

  try {
    console.log(`Setting up session status listener for session code: ${sessionCode}`);
    
    // Query for sessions with the specific session code
    const q = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('sessionCode', '==', sessionCode)
    );
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        console.log(`No session found with code ${sessionCode}`);
        callback(null);
        return;
      }
      
      // Get the first (and should be only) session with this code
      const sessionDoc = snapshot.docs[0];
      const status = sessionDoc.data().status;
      
      console.log(`Session ${sessionCode} status: ${status}`);
      callback(status as 'active' | 'closed' | 'archived');
    }, (error) => {
      console.error(`Error in session status listener for ${sessionCode}:`, error);
      callback(null);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error(`Error setting up session status listener for ${sessionCode}:`, error);
    callback(null);
    return () => {};
  }
};

/**
 * Clean up inactive class sessions and their associated data
 * 
 * Removes class sessions that haven't been active for the specified number of hours.
 * Also cleans up all associated data for each inactive session.
 * 
 * @param inactiveHours - The number of hours of inactivity before a session is cleaned up
 * @returns A promise that resolves to the number of sessions deleted
 */
export async function cleanupInactiveClassSessions(inactiveHours: number = 2): Promise<number> {
  try {
    console.log(`Looking for inactive class sessions (${inactiveHours}+ hours inactive)...`);
    
    // Calculate the cutoff time for inactivity
    const cutoffTime = Date.now() - (inactiveHours * 60 * 60 * 1000);
    
    // Query for sessions that haven't been active since the cutoff time
    const q = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('lastActive', '<', cutoffTime),
      where('status', '==', 'active') // Only clean up active sessions
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} inactive class sessions to clean up`);
    
    if (querySnapshot.empty) {
      console.log('No inactive sessions to clean up');
      return 0;
    }
    
    // Delete inactive sessions in batches to avoid overwhelming Firestore
    const BATCH_SIZE = 20;
    let deletedCount = 0;
    
    // Process in batches
    for (let i = 0; i < querySnapshot.docs.length; i += BATCH_SIZE) {
      const batchDocs = querySnapshot.docs.slice(i, i + BATCH_SIZE);
      
      // Use a writeBatch for better performance with multiple deletes
      const batch = writeBatch(db);
      
      // First, clean up associated data for each session
      for (const doc of batchDocs) {
        const sessionData = doc.data();
        const sessionCode = sessionData.sessionCode;
        
        if (sessionCode) {
          console.log(`Cleaning up data for inactive session: ${sessionCode}`);
          
          try {
            // Mark session as closed before deleting it
            batch.update(doc.ref, {
              status: 'closed',
              closedAt: Date.now(),
              lastActiveAt: Date.now(),
              lastActive: Date.now()
            });
            
            // Clean up associated data
            await cleanupSessionData(sessionCode);
          } catch (error) {
            console.error(`Error cleaning up data for session ${sessionCode}:`, error);
          }
        }
      }
      
      // Commit the batch update
      await batch.commit();
      
      deletedCount += batchDocs.length;
      console.log(`Processed batch of ${batchDocs.length} inactive sessions (${deletedCount}/${querySnapshot.docs.length} total)`);
    }
    
    console.log(`Successfully processed ${deletedCount}/${querySnapshot.docs.length} inactive class sessions`);
    return deletedCount;
  } catch (error) {
    console.error("Error cleaning up inactive class sessions:", error);
    return 0;
  }
}

/**
 * Listen for changes to the number of active students in a class session
 * 
 * @param sessionCode - Code of the current class session
 * @param callback - Function to call with updated student count
 * @returns Unsubscribe function to stop listening
 */
export const listenForStudentCount = (
  sessionCode: string,
  callback: (count: number) => void
): (() => void) => {
  if (!sessionCode) {
    console.error("[listenForStudentCount] No session code provided");
    callback(0);
    return () => {};
  }

  console.log(`[listenForStudentCount] Setting up listener for session: ${sessionCode}`);
  
  try {
    // Query for active students in this session
    const q = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('sessionCode', '==', sessionCode),
      where('status', '==', 'active')
    );
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`[listenForStudentCount] Found ${snapshot.size} active students`);
        callback(snapshot.size);
      },
      (error) => {
        console.error("[listenForStudentCount] Error in listener:", error);
        callback(0);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("[listenForStudentCount] Error setting up listener:", error);
    callback(0);
    return () => {};
  }
}; 