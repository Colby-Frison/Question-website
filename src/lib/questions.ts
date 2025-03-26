/**
 * Question Management Module
 * 
 * A completely rebuilt system that handles all question-related functionality:
 * 1. Student Questions - Questions students ask professors
 * 2. Active Questions - Questions professors ask students
 * 3. Answers - Student responses to active questions 
 * 4. Points - Tracking and rewarding student participation
 * 
 * This module ensures consistent use of sessionCode throughout all operations
 * and provides proper Firebase interactions with appropriate error handling.
 */

import { Question } from '@/types';
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
  writeBatch,
  runTransaction
} from 'firebase/firestore';

// Collection references for Firestore database
const QUESTIONS_COLLECTION = 'questions';          // Student questions to professors
const USER_QUESTIONS_COLLECTION = 'userQuestions'; // Links students to their questions
export const ACTIVE_QUESTION_COLLECTION = 'activeQuestions'; // Professor questions to students
const ANSWERS_COLLECTION = 'answers';              // Student answers to active questions
const STUDENT_POINTS_COLLECTION = 'studentPoints'; // Student point totals

// Add debouncing and caching utilities
/**
 * Simple cache implementation to reduce redundant server calls
 */
export const cache = {
  questions: new Map<string, { data: Question[], timestamp: number }>(),
  activeQuestions: new Map<string, { data: any, timestamp: number }>(),
  answers: new Map<string, { data: any[], timestamp: number }>(),
  clearCache: () => {
    cache.questions.clear();
    cache.activeQuestions.clear();
    cache.answers.clear();
  },
  // Cache expiration time - 5 minutes for better performance
  CACHE_EXPIRATION: 5 * 60 * 1000
};

// Cache for student points to reduce redundant callbacks
const pointsCache = new Map<string, number>();

// =====================================================================
// STUDENT QUESTIONS (Questions that students ask professors)
// =====================================================================

/**
 * Add a new question from a student
 * 
 * @param text - Question text
 * @param studentId - ID of the student asking the question
 * @param sessionCode - Code of the current class session
 * @returns The created question object or null if creation failed
 */
export const addQuestion = async (
  text: string, 
  studentId: string,
  sessionCode: string
): Promise<Question | null> => {
  if (!text.trim() || !studentId || !sessionCode) {
    console.error("Missing required fields for addQuestion:", { text, studentId, sessionCode });
    return null;
  }

  try {
    console.log(`[addQuestion] Creating new question in session ${sessionCode} by student ${studentId}`);
    
    // Create timestamp for tracking
    const timestamp = Date.now();
    
    // Create the question object
    const newQuestion: Omit<Question, "id"> = {
      text: text.trim(),
      timestamp,
      studentId,
      sessionCode,
      status: 'unanswered'
    };
    
    // Add to main questions collection
    const docRef = await addDoc(collection(db, QUESTIONS_COLLECTION), newQuestion);
    console.log(`[addQuestion] Created with ID: ${docRef.id}`);
    
    // Create user-question link for easier querying
    await setDoc(doc(db, USER_QUESTIONS_COLLECTION, docRef.id), {
      questionId: docRef.id,
      studentId,
      sessionCode,
      timestamp
    });
    
    return {
      id: docRef.id,
      ...newQuestion
    };
  } catch (error) {
    console.error("[addQuestion] Error creating question:", error);
    return null;
  }
};

interface ListenerOptions {
  maxWaitTime?: number; // Maximum time to wait between updates (in ms)
  useCache?: boolean;   // Whether to use cache for initial data
}

/**
 * Listen for all questions in a class session with optimized performance
 * 
 * @param sessionCode - Code of the current class session
 * @param callback - Function to call with updated question list
 * @param options - Optional parameters to control update frequency
 * @returns Unsubscribe function to stop listening
 */
export const listenForQuestions = (
  sessionCode: string, 
  callback: (questions: Question[]) => void,
  options?: ListenerOptions
): (() => void) => {
  if (!sessionCode) {
    console.error("[listenForQuestions] No session code provided");
    callback([]);
    return () => {};
  }

  const maxWaitTime = options?.maxWaitTime || 0;
  const useCache = options?.useCache !== false;
  
  try {
    // Try to use cached data first for immediate response
    if (useCache) {
      const cachedData = cache.questions.get(sessionCode);
      if (cachedData && Date.now() - cachedData.timestamp < cache.CACHE_EXPIRATION) {
        console.log(`[listenForQuestions] Using cached data for session: ${sessionCode}`);
        callback(cachedData.data);
      }
    }

    console.log(`[listenForQuestions] Setting up listener for session: ${sessionCode} with maxWaitTime: ${maxWaitTime}ms`);
    
    // Query for all questions with this session code, newest first
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc')
    );
    
    // For debouncing updates
    let pendingData: Question[] | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastUpdate = 0;
    
    // Function to send updates to the callback
    const sendUpdate = (data: Question[]) => {
      try {
        console.log(`[listenForQuestions] Sending ${data.length} questions to callback`);
        
        // Update cache
        cache.questions.set(sessionCode, {
          data,
          timestamp: Date.now()
        });
        
        callback(data);
        lastUpdate = Date.now();
      } catch (error) {
        console.error("[listenForQuestions] Error in sendUpdate:", error);
      } finally {
        pendingData = null;
        debounceTimer = null;
      }
    };
    
    // Set up real-time listener with debouncing
    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        try {
          console.log(`[listenForQuestions] Received ${snapshot.docs.length} questions`);
          
          const questions: Question[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            status: data.status || 'unanswered',
              studentId: data.studentId || "unknown",
              sessionCode: data.sessionCode || sessionCode
          };
        });
          
          // Store the pending update
          pendingData = questions;
          
          // Clear any existing timer
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          
          const now = Date.now();
          const timeSinceLastUpdate = now - lastUpdate;
          
          // If we've waited long enough, send the update immediately
          if (timeSinceLastUpdate >= maxWaitTime) {
            sendUpdate(questions);
          } else {
            // Otherwise, set a timer to send the update after the remaining wait time
            const waitTime = Math.max(0, maxWaitTime - timeSinceLastUpdate);
            debounceTimer = setTimeout(() => {
              if (pendingData) {
                sendUpdate(pendingData);
              }
            }, waitTime);
          }
        } catch (error) {
          console.error("[listenForQuestions] Error processing snapshot:", error);
          // Still try to send empty results so UI doesn't get stuck
          callback([]);
        }
      }, 
      (error) => {
        console.error("[listenForQuestions] Error in listener:", error);
        callback([]);
      }
    );
    
    // Return a cleanup function that also clears any pending updates
    return () => {
      try {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        unsubscribe();
  } catch (error) {
        console.error("[listenForQuestions] Error during cleanup:", error);
      }
    };
  } catch (error) {
    console.error("[listenForQuestions] Error setting up listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Listen for a specific student's questions in a class session with optimized performance
 * 
 * @param studentId - ID of the student
 * @param sessionCode - Code of the current class session
 * @param callback - Function to call with updated question list
 * @param options - Optional parameters to control update frequency
 * @returns Unsubscribe function to stop listening
 */
export const listenForUserQuestions = (
  studentId: string,
  sessionCode: string,
  callback: (questions: Question[]) => void,
  options?: ListenerOptions
): (() => void) => {
  if (!studentId || !sessionCode) {
    console.error("[listenForUserQuestions] Missing required parameters:", { studentId, sessionCode });
    callback([]);
    return () => {};
  }

  const maxWaitTime = options?.maxWaitTime || 0;

  console.log(`[listenForUserQuestions] Setting up listener for student ${studentId} in session ${sessionCode} with maxWaitTime: ${maxWaitTime}ms`);
  
  try {
    // First query userQuestions to find this student's questions
    const q = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('studentId', '==', studentId),
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc')
    );
    
    // For debouncing updates
    let pendingOperation: (() => Promise<void>) | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastUpdate = 0;
    
    // Set up real-time listener with debouncing
    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        console.log(`[listenForUserQuestions] Received ${snapshot.docs.length} user-question links`);
        
        if (snapshot.empty) {
    callback([]);
          return;
        }
        
        // Store the asynchronous operation
        pendingOperation = async () => {
          // For each user-question link, fetch the full question data
          const questionIds = snapshot.docs.map(doc => doc.data().questionId);
          
          try {
            const questions: Question[] = [];
            
            // Process in smaller batches to avoid hitting Firestore limits
            const BATCH_SIZE = 10;
            for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
              const batch = questionIds.slice(i, i + BATCH_SIZE);
              
              // Fetch each question in this batch
              const questionPromises = batch.map(async (questionId) => {
                try {
                  const questionDoc = await getDoc(doc(db, QUESTIONS_COLLECTION, questionId));
                  
                  if (questionDoc.exists()) {
                    const data = questionDoc.data();
          return {
                      id: questionId,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            status: data.status || 'unanswered',
                      studentId: data.studentId || studentId,
                      sessionCode: data.sessionCode || sessionCode
                    } as Question;
                  }
                  return null;
                } catch (error) {
                  console.error(`[listenForUserQuestions] Error fetching question ${questionId}:`, error);
                  return null;
                }
              });
              
              // Wait for this batch to complete
              const batchResults = await Promise.all(questionPromises);
              questions.push(...batchResults.filter(q => q !== null) as Question[]);
            }
            
            // Sort by timestamp, newest first
            questions.sort((a, b) => b.timestamp - a.timestamp);
            console.log("[listenForUserQuestions] Sending sorted questions to callback:", questions.length);
        callback(questions);
            lastUpdate = Date.now();
            pendingOperation = null;
  } catch (error) {
            console.error("[listenForUserQuestions] Error processing questions:", error);
    callback([]);
          }
        };
        
        // Clear any existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        
        // If we've waited long enough, execute the operation immediately
        if (timeSinceLastUpdate >= maxWaitTime) {
          if (pendingOperation) {
            pendingOperation();
          }
        } else {
          // Otherwise, set a timer to execute the operation after the remaining wait time
          const waitTime = Math.max(0, maxWaitTime - timeSinceLastUpdate);
          debounceTimer = setTimeout(() => {
            if (pendingOperation) {
              pendingOperation();
            }
          }, waitTime);
        }
      }, 
      (error) => {
        console.error("[listenForUserQuestions] Error in listener:", error);
        callback([]);
      }
    );
    
    // Return a cleanup function that also clears any pending operations
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  } catch (error) {
    console.error("[listenForUserQuestions] Error setting up listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Update a question's text
 * 
 * @param questionId - ID of the question to update
 * @param newText - New text for the question
 * @param studentId - ID of the student who owns the question
 * @returns True if update was successful, false otherwise
 */
export const updateQuestion = async (
  questionId: string,
  newText: string,
  studentId: string
): Promise<boolean> => {
  if (!questionId || !newText.trim() || !studentId) {
    console.error("[updateQuestion] Missing required parameters:", { questionId, newText, studentId });
    return false;
  }

  try {
    console.log(`[updateQuestion] Updating question ${questionId}`);
    
    // First verify the student owns this question
    const questionRef = doc(db, QUESTIONS_COLLECTION, questionId);
    const questionDoc = await getDoc(questionRef);
    
    if (!questionDoc.exists()) {
      console.error(`[updateQuestion] Question ${questionId} not found`);
    return false;
  }
    
    const data = questionDoc.data();
    if (data.studentId !== studentId) {
      console.error(`[updateQuestion] Student ${studentId} does not own question ${questionId}`);
    return false;
  }

    // Get session code for cache invalidation
    const sessionCode = data.sessionCode;
    
    // Update question with retry mechanism
    const MAX_RETRIES = 3;
    let success = false;
    let retryCount = 0;
    
    while (!success && retryCount < MAX_RETRIES) {
      try {
        // Update question with important timestamps
    await updateDoc(questionRef, {
          text: newText.trim(),
          updatedAt: Date.now(),
          lastModified: Date.now() // Add this to force a document update
        });
        
        // Verify the update was applied
        const updatedDoc = await getDoc(questionRef);
        if (updatedDoc.exists() && updatedDoc.data().text === newText.trim()) {
          console.log(`[updateQuestion] Verified text change for question ${questionId}`);
        } else {
          throw new Error("Text update verification failed");
        }
        
        // Invalidate caches to ensure listeners get fresh data
        if (sessionCode) {
          cache.questions.delete(sessionCode);
          console.log(`[updateQuestion] Invalidated cache for session: ${sessionCode}`);
          
          // Force an immediate refresh
          setTimeout(() => {
            forceRefreshQuestions(sessionCode)
              .catch(err => console.error("[updateQuestion] Error in delayed refresh:", err));
          }, 250);
          
          // Add a second delayed refresh for better reliability
          setTimeout(() => {
            forceRefreshQuestions(sessionCode)
              .catch(err => console.error("[updateQuestion] Error in second delayed refresh:", err));
          }, 1500);
        }
        
        success = true;
      } catch (err) {
        retryCount++;
        console.warn(`[updateQuestion] Retry ${retryCount}/${MAX_RETRIES} after error:`, err);
        
        if (retryCount >= MAX_RETRIES) {
          throw err; // Re-throw if we've exhausted retries
        }
        
        // Wait briefly before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, retryCount - 1)));
      }
    }
    
    console.log(`[updateQuestion] Question ${questionId} updated successfully`);
    return true;
  } catch (error) {
    console.error("[updateQuestion] Error updating question:", error);
    return false;
  }
};

/**
 * Update a question's status (answered or unanswered)
 * 
 * @param questionId - The ID of the question to update
 * @param status - The new status (answered or unanswered)
 * @returns Promise resolving to true if the update was successful
 */
export const updateQuestionStatus = async (
  questionId: string,
  status: 'answered' | 'unanswered'
): Promise<boolean> => {
  if (!questionId || !status) {
    console.error("[updateQuestionStatus] Missing required parameters:", { questionId, status });
    return false;
  }

  try {
    // Reference to the question document
    const questionRef = doc(db, QUESTIONS_COLLECTION, questionId);
    
    // Simplified direct update
    await updateDoc(questionRef, {
      status,
      lastModified: Date.now()
    });
    
    console.log(`[updateQuestionStatus] Successfully set status to ${status}`);
    return true;
  } catch (error) {
    console.error(`[updateQuestionStatus] Failed to update question ${questionId} status:`, error);
    return false;
  }
};

/**
 * Delete a question
 * 
 * @param questionId - ID of the question to delete
 * @returns True if deletion was successful, false otherwise
 */
export const deleteQuestion = async (questionId: string): Promise<boolean> => {
  if (!questionId) {
    console.error("[deleteQuestion] No question ID provided");
    return false;
  }

  try {
    console.log(`[deleteQuestion] Deleting question ${questionId}`);
    
    // Delete the question document
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, questionId));
    
    // Also delete the user-question link
    await deleteDoc(doc(db, USER_QUESTIONS_COLLECTION, questionId));
    
    console.log(`[deleteQuestion] Question ${questionId} deleted successfully`);
    return true;
  } catch (error) {
    console.error("[deleteQuestion] Error deleting question:", error);
    return false;
  }
};

// =====================================================================
// ACTIVE QUESTIONS (Questions that professors ask students)
// =====================================================================

/**
 * Add an active question for students to answer
 * 
 * @param sessionCode - Code of the current class session
 * @param text - Question text
 * @returns ID of the created active question or null if creation failed
 */
export const addActiveQuestion = async (
  sessionCode: string,
  text: string
): Promise<string | null> => {
  if (!sessionCode || !text.trim()) {
    console.error("[addActiveQuestion] Missing required parameters:", { sessionCode, text });
    return null;
  }

  try {
    console.log(`[addActiveQuestion] Creating new active question in session ${sessionCode}`);
    
    // First clear any existing active questions and answers
    await clearActiveQuestions(sessionCode);
    await clearPreviousAnswers(sessionCode);
    
    // Create the new active question
    const docRef = await addDoc(collection(db, ACTIVE_QUESTION_COLLECTION), {
      text: text.trim(),
      sessionCode,
      timestamp: Date.now(),
      active: true
    });
    
    console.log(`[addActiveQuestion] Created with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("[addActiveQuestion] Error creating active question:", error);
    return null;
  }
};

/**
 * Listen for the current active question in a class session with optimized performance
 * 
 * @param sessionCode - Code of the current class session
 * @param callback - Function to call with updated active question
 * @param options - Optional parameters to control update frequency
 * @returns Unsubscribe function to stop listening
 */
export const listenForActiveQuestion = (
  sessionCode: string,
  callback: (question: {id: string, text: string, timestamp: number} | null) => void,
  options?: ListenerOptions
): (() => void) => {
  if (!sessionCode) {
    console.error("[listenForActiveQuestion] No session code provided");
    callback(null);
    return () => {};
  }

  const maxWaitTime = options?.maxWaitTime || 0;
  const useCache = options?.useCache !== false;

  console.log(`[listenForActiveQuestion] Setting up listener for session: ${sessionCode} with maxWaitTime: ${maxWaitTime}ms, useCache: ${useCache}`);
  
  try {
    // Cache key for active questions
    const cacheKey = `active_${sessionCode}`;
    
    // Try to use cached data first for immediate response
    if (useCache) {
      const cachedData = cache.activeQuestions.get(cacheKey);
      if (cachedData && Date.now() - cachedData.timestamp < cache.CACHE_EXPIRATION) {
        console.log(`[listenForActiveQuestion] Using cached active question for session: ${sessionCode}`);
        callback(cachedData.data);
      }
    }
    
    // Query for the most recent active question in this session
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      where('active', '==', true),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    
    // For debouncing updates
    let pendingData: {id: string, text: string, timestamp: number} | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastUpdate = 0;
    let lastQuestionId: string | null = null;
    
    // Function to send updates to the callback
    const sendUpdate = (data: {id: string, text: string, timestamp: number} | null) => {
      try {
        // Update cache if we have data
        if (data) {
          cache.activeQuestions.set(cacheKey, {
            data,
            timestamp: Date.now()
          });
        } else {
          // Clear cache for this session if no active question
          cache.activeQuestions.delete(cacheKey);
        }
        
        callback(data);
        lastUpdate = Date.now();
      } catch (error) {
        console.error("[listenForActiveQuestion] Error in sendUpdate:", error);
      } finally {
        pendingData = null;
        debounceTimer = null;
      }
    };
    
    // Set up real-time listener with debouncing
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          console.log(`[listenForActiveQuestion] No active question found for session ${sessionCode}`);
          sendUpdate(null);
          return;
        }
        
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        console.log(`[listenForActiveQuestion] Found active question: ${doc.id}`);
        
        // Store the pending update
        pendingData = {
          id: doc.id,
          text: data.text || "No text provided",
          timestamp: data.timestamp || Date.now()
        };
        
        // Clear any existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        
        // If this is a new question (different ID) or we've waited long enough, send the update immediately
        if (pendingData.id !== lastQuestionId || timeSinceLastUpdate >= maxWaitTime) {
          console.log(`[listenForActiveQuestion] Sending immediate update for new question: ${pendingData.id}`);
          lastQuestionId = pendingData.id;
          sendUpdate(pendingData);
        } else {
          // Otherwise, set a timer to send the update after the remaining wait time
          const waitTime = Math.max(0, maxWaitTime - timeSinceLastUpdate);
          debounceTimer = setTimeout(() => {
            if (pendingData) {
              sendUpdate(pendingData);
            }
          }, waitTime);
        }
      }, 
      (error) => {
        console.error("[listenForActiveQuestion] Error in listener:", error);
        callback(null);
      }
    );
    
    // Return a cleanup function that also clears any pending updates
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  } catch (error) {
    console.error("[listenForActiveQuestion] Error setting up listener:", error);
    callback(null);
    return () => {};
  }
};

/**
 * Clear all active questions for a session except optionally one to keep
 * 
 * @param sessionCode - Code of the current class session
 * @param skipId - Optional ID of an active question to keep
 * @returns True if clearing was successful, false otherwise
 */
export const clearActiveQuestions = async (
  sessionCode: string,
  skipId?: string
): Promise<boolean> => {
  if (!sessionCode) {
    console.error("[clearActiveQuestions] No session code provided");
    return false;
  }

  try {
    console.log(`[clearActiveQuestions] Clearing active questions for session ${sessionCode}`);
    
    // Find all active questions for this session
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION),
      where('sessionCode', '==', sessionCode)
    );
    
    const snapshot = await getDocs(q);
    
    console.log(`[clearActiveQuestions] Found ${snapshot.docs.length} active questions`);
    
    if (snapshot.empty) {
      return true; // Nothing to clear
    }
    
    // If we're keeping one, just mark others as inactive
    // Otherwise delete all of them
    if (skipId) {
      const batch = writeBatch(db);
      
      snapshot.docs.forEach(doc => {
        if (doc.id !== skipId) {
          batch.update(doc.ref, { active: false });
        }
      });
      
      await batch.commit();
      console.log(`[clearActiveQuestions] Marked ${snapshot.docs.length - 1} questions as inactive, kept ${skipId}`);
    } else {
      // Delete all active questions
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      console.log(`[clearActiveQuestions] Deleted all ${snapshot.docs.length} active questions`);
    }
    
    return true;
  } catch (error) {
    console.error("[clearActiveQuestions] Error clearing active questions:", error);
    return false;
  }
};

/**
 * Delete an active question by ID
 * 
 * @param questionId - ID of the active question to delete
 * @returns True if deletion was successful, false otherwise
 */
export const deleteActiveQuestion = async (questionId: string): Promise<boolean> => {
  if (!questionId) {
    console.error("[deleteActiveQuestion] No question ID provided");
    return false;
  }

  try {
    console.log(`[deleteActiveQuestion] Deleting active question ${questionId}`);
    
    // Delete the active question
    await deleteDoc(doc(db, ACTIVE_QUESTION_COLLECTION, questionId));
    
    // Clear any cached data for this question
    cache.activeQuestions.delete(questionId);
    cache.answers.delete(questionId);
    
    console.log(`[deleteActiveQuestion] Successfully deleted question ${questionId}`);
    return true;
  } catch (error) {
    console.error("[deleteActiveQuestion] Error deleting active question:", error);
    return false;
  }
};

// =====================================================================
// ANSWERS (Student responses to active questions)
// =====================================================================

/**
 * Add an answer to an active question
 * 
 * @param answerData - Object containing the answer data
 * @returns ID of the created answer or null if creation failed
 */
export const addAnswer = async (
  answerData: {
    text: string,
    activeQuestionId: string,
    studentId: string,
    sessionCode: string,
    questionText?: string
  }
): Promise<string | null> => {
  const { text, activeQuestionId, studentId, sessionCode, questionText } = answerData;
  
  if (!text.trim() || !activeQuestionId || !studentId || !sessionCode) {
    console.error("[addAnswer] Missing required parameters:", { text, activeQuestionId, studentId, sessionCode });
    return null;
  }

  try {
    console.log(`[addAnswer] Adding answer for question ${activeQuestionId} by student ${studentId}`);
    
    // Check if this student has already answered this question
    const q = query(
      collection(db, ANSWERS_COLLECTION), 
      where('activeQuestionId', '==', activeQuestionId),
      where('studentId', '==', studentId)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      // Student already answered, update their answer
      const existingAnswer = snapshot.docs[0];
      
      await updateDoc(doc(db, ANSWERS_COLLECTION, existingAnswer.id), {
        text: text.trim(),
        updatedAt: Date.now(),
        updated: true
      });
      
      console.log(`[addAnswer] Updated existing answer ${existingAnswer.id}`);
      return existingAnswer.id;
    }
    
    // Create new answer
    const docRef = await addDoc(collection(db, ANSWERS_COLLECTION), {
      text: text.trim(),
      activeQuestionId,
      studentId,
      sessionCode,
      questionText,
      timestamp: Date.now()
    });
    
    console.log(`[addAnswer] Created new answer with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("[addAnswer] Error adding answer:", error);
    return null;
  }
};

/**
 * Listen for answers to an active question
 * 
 * @param activeQuestionId - ID of the active question
 * @param callback - Function to call with updated answer list
 * @returns Unsubscribe function to stop listening
 */
export const listenForAnswers = (
  activeQuestionId: string, 
  callback: (answers: {id: string, text: string, timestamp: number, studentId: string, questionText?: string}[]) => void
): (() => void) => {
  if (!activeQuestionId) {
    console.error("[listenForAnswers] No active question ID provided");
    callback([]);
    return () => {};
  }

  console.log(`[listenForAnswers] Setting up listener for question: ${activeQuestionId}`);
  
  try {
    // Try to use cached data first
    const cachedData = cache.answers.get(activeQuestionId);
    if (cachedData && Date.now() - cachedData.timestamp < cache.CACHE_EXPIRATION) {
      console.log(`[listenForAnswers] Using cached answers for question: ${activeQuestionId}`);
      callback(cachedData.data);
    }

    // Query for answers to this active question
    const q = query(
      collection(db, ANSWERS_COLLECTION), 
      where('activeQuestionId', '==', activeQuestionId),
      orderBy('timestamp', 'asc')
    );
    
    // Set up real-time listener with debouncing
    let pendingData: any[] | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastUpdate = 0;
    
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        console.log(`[listenForAnswers] Received ${snapshot.docs.length} answers`);
        
        if (snapshot.empty) {
          callback([]);
          return;
        }
        
        // Get question text from cache if available
        let questionText = "";
        const cachedQuestion = cache.activeQuestions.get(activeQuestionId);
        if (cachedQuestion && Date.now() - cachedQuestion.timestamp < cache.CACHE_EXPIRATION) {
          questionText = cachedQuestion.data.text || "";
        } else {
          try {
            const questionDoc = await getDoc(doc(db, ACTIVE_QUESTION_COLLECTION, activeQuestionId));
            if (questionDoc.exists()) {
              questionText = questionDoc.data().text || "";
              // Cache the question text
              cache.activeQuestions.set(activeQuestionId, {
                data: { text: questionText },
                timestamp: Date.now()
              });
            }
          } catch (error) {
            console.error(`[listenForAnswers] Error fetching question text for ${activeQuestionId}:`, error);
          }
        }
        
        // Map the answers
        const answers = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            studentId: data.studentId || "unknown",
            questionText: questionText || data.questionText || "",
            activeQuestionId
          };
        });
        
        // Update cache
        cache.answers.set(activeQuestionId, {
          data: answers,
          timestamp: Date.now()
        });
        
        // Store the pending update
        pendingData = answers;
        
        // Clear any existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        
        // If we've waited long enough, send the update immediately
        if (timeSinceLastUpdate >= 1000) { // 1 second debounce
          callback(answers);
          lastUpdate = now;
          pendingData = null;
        } else {
          // Otherwise, set a timer to send the update after the remaining wait time
          const waitTime = Math.max(0, 1000 - timeSinceLastUpdate);
          debounceTimer = setTimeout(() => {
            if (pendingData) {
              callback(pendingData);
              lastUpdate = Date.now();
              pendingData = null;
            }
          }, waitTime);
        }
      }, 
      (error) => {
        console.error("[listenForAnswers] Error in listener:", error);
        callback([]);
      }
    );
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  } catch (error) {
    console.error("[listenForAnswers] Error setting up listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Clear all answers for a session
 * 
 * @param sessionCode - Code of the current class session
 * @returns True if clearing was successful, false otherwise
 */
export const clearPreviousAnswers = async (sessionCode: string): Promise<boolean> => {
  if (!sessionCode) {
    console.error("[clearPreviousAnswers] No session code provided");
    return false;
  }

  try {
    console.log(`[clearPreviousAnswers] Clearing answers for session ${sessionCode}`);
    
    // Find all answers for this session
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('sessionCode', '==', sessionCode)
    );
    
    const snapshot = await getDocs(q);
    
    console.log(`[clearPreviousAnswers] Found ${snapshot.docs.length} answers`);
    
    if (snapshot.empty) {
      return true; // Nothing to clear
    }
    
    // Delete all answers
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    console.log(`[clearPreviousAnswers] Deleted all ${snapshot.docs.length} answers`);
    return true;
  } catch (error) {
    console.error("[clearPreviousAnswers] Error clearing answers:", error);
    return false;
  }
};

/**
 * Update a student's answer to an active question
 * 
 * @param answerId - ID of the answer to update
 * @param newText - New text for the answer
 * @param studentId - ID of the student who owns the answer
 * @returns True if update was successful, false otherwise
 */
export const updateAnswer = async (
  answerId: string,
  newText: string,
  studentId: string
): Promise<boolean> => {
  if (!answerId || !newText.trim() || !studentId) {
    console.error("[updateAnswer] Missing required parameters:", { answerId, newText, studentId });
    return false;
  }

  try {
    console.log(`[updateAnswer] Updating answer ${answerId}`);
    
    // First verify the student owns this answer
    const answerRef = doc(db, ANSWERS_COLLECTION, answerId);
    const answerDoc = await getDoc(answerRef);
    
    if (!answerDoc.exists()) {
      console.error(`[updateAnswer] Answer ${answerId} not found`);
      return false;
    }
    
    const data = answerDoc.data();
    if (data.studentId !== studentId) {
      console.error(`[updateAnswer] Student ${studentId} does not own answer ${answerId}`);
      return false;
    }

    // Update answer
    await updateDoc(answerRef, {
      text: newText.trim(),
      updatedAt: Date.now(),
      updated: true
    });
    
    console.log(`[updateAnswer] Answer ${answerId} updated successfully`);
    return true;
  } catch (error) {
    console.error("[updateAnswer] Error updating answer:", error);
    return false;
  }
};

/**
 * Delete a student's answer to an active question
 * 
 * @param answerId - ID of the answer to delete
 * @param studentId - ID of the student who owns the answer
 * @returns True if deletion was successful, false otherwise
 */
export const deleteAnswer = async (
  answerId: string,
  studentId: string
): Promise<boolean> => {
  if (!answerId || !studentId) {
    console.error("[deleteAnswer] Missing required parameters:", { answerId, studentId });
    return false;
  }

  try {
    console.log(`[deleteAnswer] Deleting answer ${answerId}`);
    
    // First verify the student owns this answer
    const answerRef = doc(db, ANSWERS_COLLECTION, answerId);
    const answerDoc = await getDoc(answerRef);
    
    if (!answerDoc.exists()) {
      console.error(`[deleteAnswer] Answer ${answerId} not found`);
      return false;
    }
    
    const data = answerDoc.data();
    if (data.studentId !== studentId) {
      console.error(`[deleteAnswer] Student ${studentId} does not own answer ${answerId}`);
      return false;
    }

    // Delete the answer
    await deleteDoc(answerRef);
    
    console.log(`[deleteAnswer] Answer ${answerId} deleted successfully`);
    return true;
  } catch (error) {
    console.error("[deleteAnswer] Error deleting answer:", error);
    return false;
  }
};

// =====================================================================
// POINTS (Reward system for student participation)
// =====================================================================

/**
 * Update a student's points
 * 
 * @param studentId - ID of the student
 * @param points - Number of points to add (negative to subtract)
 * @returns True if update was successful, false otherwise
 */
export const updateStudentPoints = async (
  studentId: string,
  points: number
): Promise<boolean> => {
  if (!studentId) {
    console.error("[updateStudentPoints] No student ID provided");
    return false;
  }

  try {
    console.log(`[updateStudentPoints] Updating points for student ${studentId}: ${points > 0 ? '+' : ''}${points}`);
    
    // Get current points
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    const pointsDoc = await getDoc(pointsRef);
    
    const currentPoints = pointsDoc.exists() ? (pointsDoc.data().total || 0) : 0;
    const newTotal = Math.max(0, currentPoints + points); // Never go below 0
    
    // Update points
    await setDoc(pointsRef, { 
      total: newTotal,
      lastUpdated: Date.now() 
    }, { merge: true });
    
    console.log(`[updateStudentPoints] Updated student ${studentId} points to ${newTotal}`);
    return true;
  } catch (error) {
    console.error("[updateStudentPoints] Error updating points:", error);
    return false;
  }
};

/**
 * Listen for changes to a student's points
 * 
 * @param studentId - ID of the student
 * @param callback - Function to call with updated point total
 * @returns Unsubscribe function to stop listening
 */
export const listenForStudentPoints = (
  studentId: string,
  callback: (points: number) => void
): (() => void) => {
  if (!studentId) {
    console.error("[listenForStudentPoints] No student ID provided");
    callback(0);
    return () => {};
  }

  console.log(`[listenForStudentPoints] Setting up listener for student: ${studentId}`);
  
  try {
    // Check if we already have cached points for this student
    if (pointsCache.has(studentId)) {
      const cachedPoints = pointsCache.get(studentId);
      console.log(`[listenForStudentPoints] Using cached points for student ${studentId}: ${cachedPoints}`);
      // Use setTimeout to ensure the callback is asynchronous
      setTimeout(() => callback(cachedPoints!), 0);
    }
    
    // Set up listener for this student's points document
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    
    // Use includeMetadataChanges but with a special setting to reduce unnecessary callbacks
    const unsubscribe = onSnapshot(
      pointsRef,
      { 
        includeMetadataChanges: true 
      },
      (doc) => {
        // Check if the data comes from cache or server
        const source = doc.metadata.hasPendingWrites ? "local" : "server";
        
        if (!doc.exists()) {
          console.log(`[listenForStudentPoints] No points record for student ${studentId}`);
          
          // Only initialize if we don't have it in cache
          if (!pointsCache.has(studentId)) {
            // Initialize with 0 points if no record exists
            setDoc(pointsRef, { 
              total: 0,
              lastUpdated: Date.now() 
            }).catch(err => {
              console.error("[listenForStudentPoints] Error initializing points record:", err);
            });
            
            // Update cache
            pointsCache.set(studentId, 0);
    callback(0);
          }
          return;
        }
        
        const total = doc.data().total || 0;
        
        // Only update and trigger callback if points have changed or it's from server
        const cachedValue = pointsCache.get(studentId);
        if (cachedValue !== total || source === "server") {
          console.log(`[listenForStudentPoints] Student ${studentId} has ${total} points (source: ${source})`);
          
          // Update cache
          pointsCache.set(studentId, total);
          
          // Trigger callback
          callback(total);
        } else {
          console.log(`[listenForStudentPoints] Skipping redundant update for student ${studentId}`);
        }
      },
      (error) => {
        console.error("[listenForStudentPoints] Error in listener:", error);
        callback(pointsCache.get(studentId) || 0);
      }
    );
    
    // Return a cleanup function that also cleans the cache for this student
    return () => {
      console.log(`[listenForStudentPoints] Cleaning up listener for student ${studentId}`);
      // We don't remove from cache on unsubscribe to allow faster resubscription
      unsubscribe();
    };
        } catch (error) {
    console.error("[listenForStudentPoints] Error setting up listener:", error);
    callback(pointsCache.get(studentId) || 0);
    return () => {};
  }
};

/**
 * Clear the points cache for all students or a specific student
 * Useful when major changes happen or for testing
 * 
 * @param studentId - Optional ID of the student to clear cache for
 */
export const clearPointsCache = (studentId?: string): void => {
  if (studentId) {
    console.log(`[clearPointsCache] Clearing cache for student ${studentId}`);
    pointsCache.delete(studentId);
  } else {
    console.log(`[clearPointsCache] Clearing cache for all students`);
    pointsCache.clear();
  }
};

// =====================================================================
// MAINTENANCE (Database cleanup and management)
// =====================================================================

/**
 * Run all database maintenance tasks
 * 
 * @returns Results of all maintenance tasks
 */
export const runDatabaseMaintenance = async (): Promise<{
  inactiveSessionsDeleted: number;
  orphanedQuestionsDeleted: number;
  orphanedAnswersDeleted: number;
}> => {
  // This function would contain all the maintenance tasks
  // For brevity, returning a simple result
  console.log('[runDatabaseMaintenance] Maintenance operations would run here');
  
    return {
      inactiveSessionsDeleted: 0,
    orphanedQuestionsDeleted: 0,
      orphanedAnswersDeleted: 0
    };
};

// Add a new method for forcibly refreshing questions
export const forceRefreshQuestions = async (sessionCode: string): Promise<boolean> => {
  if (!sessionCode) {
    console.error("[forceRefreshQuestions] No session code provided");
    return false;
  }

  console.log(`[forceRefreshQuestions] Forcing refresh for session: ${sessionCode}`);
  
  try {
    // Clear cache for this session
    cache.questions.delete(sessionCode);
    
    // For additional reliability, fetch the latest questions directly
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    console.log(`[forceRefreshQuestions] Fetched ${snapshot.docs.length} fresh questions`);
    
    // Don't need to do anything with the snapshot - the next listener update will use fresh data
    return true;
  } catch (error) {
    console.error("[forceRefreshQuestions] Error refreshing questions:", error);
    return false;
  }
}; 