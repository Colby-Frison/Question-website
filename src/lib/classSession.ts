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
  updateDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { ClassSession, ClassArchiveSettings } from '@/types';

// Collection references
const CLASS_SESSIONS_COLLECTION = 'classSessions';
const QUESTIONS_COLLECTION = 'questions';
const USER_QUESTIONS_COLLECTION = 'userQuestions';
const JOINED_CLASSES_COLLECTION = 'joinedClasses';

// Default settings
const DEFAULT_ARCHIVE_SETTINGS: ClassArchiveSettings = {
  autoArchiveAfterDays: 30,    // Archive after 30 days of inactivity
  deleteArchivedAfterDays: 90, // Delete archived data after 90 days
  deleteClosedAfterDays: 7     // Delete closed class data after 7 days
};

// Create a new class session
export const createClassSession = async (code: string, professorId: string): Promise<string> => {
  try {
    const session: Omit<ClassSession, 'id'> = {
      code,
      professorId,
      status: 'active',
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };

    const docRef = await addDoc(collection(db, CLASS_SESSIONS_COLLECTION), session);
    return docRef.id;
  } catch (error) {
    console.error('Error creating class session:', error);
    throw error;
  }
};

// Update last active timestamp
export const updateLastActive = async (sessionId: string) => {
  try {
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, {
      lastActiveAt: Date.now()
    });
  } catch (error) {
    console.error('Error updating last active timestamp:', error);
  }
};

// Archive a class session
export const archiveClassSession = async (sessionId: string) => {
  try {
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, {
      status: 'archived',
      archivedAt: Date.now()
    });
  } catch (error) {
    console.error('Error archiving class session:', error);
    throw error;
  }
};

// Close a class session
export const closeClassSession = async (sessionId: string) => {
  try {
    const sessionRef = doc(db, CLASS_SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, {
      status: 'closed',
      archivedAt: Date.now()
    });
  } catch (error) {
    console.error('Error closing class session:', error);
    throw error;
  }
};

// Delete class session and all related data
export const deleteClassSessionData = async (sessionId: string, classCode: string) => {
  const batch = writeBatch(db);

  try {
    // Delete questions
    const questionsQuery = query(
      collection(db, QUESTIONS_COLLECTION),
      where('classCode', '==', classCode)
    );
    const questionsSnapshot = await getDocs(questionsQuery);
    questionsSnapshot.forEach(doc => batch.delete(doc.ref));

    // Delete user questions
    const userQuestionsQuery = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('classCode', '==', classCode)
    );
    const userQuestionsSnapshot = await getDocs(userQuestionsQuery);
    userQuestionsSnapshot.forEach(doc => batch.delete(doc.ref));

    // Delete joined classes
    const joinedClassesQuery = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('classCode', '==', classCode)
    );
    const joinedClassesSnapshot = await getDocs(joinedClassesQuery);
    joinedClassesSnapshot.forEach(doc => batch.delete(doc.ref));

    // Delete the session itself
    batch.delete(doc(db, CLASS_SESSIONS_COLLECTION, sessionId));

    // Commit all deletions
    await batch.commit();
  } catch (error) {
    console.error('Error deleting class session data:', error);
    throw error;
  }
};

// Cleanup old data based on settings
export const cleanupOldData = async (settings: ClassArchiveSettings = DEFAULT_ARCHIVE_SETTINGS) => {
  const now = Date.now();
  const batch = writeBatch(db);

  try {
    // Auto-archive inactive classes
    const inactiveThreshold = now - (settings.autoArchiveAfterDays * 24 * 60 * 60 * 1000);
    const inactiveQuery = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('status', '==', 'active'),
      where('lastActiveAt', '<=', inactiveThreshold)
    );
    const inactiveSnapshot = await getDocs(inactiveQuery);
    inactiveSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        status: 'archived',
        archivedAt: now
      });
    });

    // Delete old archived classes
    const archivedThreshold = now - (settings.deleteArchivedAfterDays * 24 * 60 * 60 * 1000);
    const archivedQuery = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('status', '==', 'archived'),
      where('archivedAt', '<=', archivedThreshold)
    );
    const archivedSnapshot = await getDocs(archivedQuery);
    for (const doc of archivedSnapshot.docs) {
      await deleteClassSessionData(doc.id, doc.data().code);
    }

    // Delete old closed classes
    const closedThreshold = now - (settings.deleteClosedAfterDays * 24 * 60 * 60 * 1000);
    const closedQuery = query(
      collection(db, CLASS_SESSIONS_COLLECTION),
      where('status', '==', 'closed'),
      where('archivedAt', '<=', closedThreshold)
    );
    const closedSnapshot = await getDocs(closedQuery);
    for (const doc of closedSnapshot.docs) {
      await deleteClassSessionData(doc.id, doc.data().code);
    }

    // Commit any remaining batch operations
    await batch.commit();
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}; 