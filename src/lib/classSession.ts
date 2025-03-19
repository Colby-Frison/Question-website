/**
 * Class Session Management Module
 * 
 * This module handles the creation and management of class sessions. A class session
 * represents an active instance of a class where a professor is teaching and
 * students are participating.
 * 
 * The module provides functionality for:
 * - Creating new class sessions
 * - Tracking session activity and timestamps
 * - Managing session lifecycle
 * 
 * Sessions are automatically cleaned up by the maintenance module after
 * a period of inactivity to keep the database clean.
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
  setDoc
} from 'firebase/firestore';

// Collection reference for Firestore database
const CLASS_SESSIONS_COLLECTION = 'classSessions';

/**
 * Create a new class session
 * 
 * Creates a new session record for a class, associated with a specific professor.
 * Each session tracks when it was created and when it was last active.
 * 
 * @param className - The name of the class the session is for
 * @param professorId - The ID of the professor creating the session
 * @returns A promise that resolves to the ID of the created session
 */
export const createClassSession = async (
  className: string,
  professorId: string
): Promise<string> => {
  if (!className || !professorId) {
    console.error("Missing parameters for createClassSession");
    throw new Error("Class name and professor ID are required");
  }

  try {
    console.log(`Creating class session for ${className} with professor ${professorId}`);
    
    // Create timestamp for tracking
    const currentTime = Date.now();
    
    // Create the session object
    const session: Omit<ClassSession, "id"> = {
      code: className,          // Use 'code' as per ClassSession interface
      professorId,
      status: 'active',         // Set status according to interface requirements
      createdAt: currentTime,
      lastActiveAt: currentTime,
      lastActive: currentTime   // For maintenance functions
    };
    
    // Add to Firestore
    const docRef = await addDoc(collection(db, CLASS_SESSIONS_COLLECTION), session);
    console.log(`Class session created with ID: ${docRef.id}`);
    
    return docRef.id;
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
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} active sessions for class ${classCode}`);
    
    // Map the documents to session objects
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      code: doc.data().code,              // Use the correct field names
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
 * End a class session
 * 
 * Removes a session from the database when it's no longer needed.
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
    await deleteDoc(doc(db, CLASS_SESSIONS_COLLECTION, sessionId));
    console.log(`Session ${sessionId} successfully ended`);
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