/**
 * Question Management Module
 * 
 * This module handles all question-related functionality including:
 * - Managing student questions for professors to answer
 * - Managing active questions that professors ask students 
 * - Handling student answers to active questions
 * - Tracking and updating student points
 * - Database maintenance operations
 * 
 * The module uses Firebase Firestore for real-time data storage and updates.
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
  writeBatch
} from 'firebase/firestore';
import { getUserId } from '@/lib/auth';

// Collection references for Firestore database
const QUESTIONS_COLLECTION = 'questions';          // Stores all student questions
const USER_QUESTIONS_COLLECTION = 'userQuestions'; // Tracks questions by individual students
const ACTIVE_QUESTION_COLLECTION = 'activeQuestions'; // Stores professor's active questions
const ANSWERS_COLLECTION = 'answers';              // Stores student answers to active questions
const STUDENT_POINTS_COLLECTION = 'studentPoints'; // Stores student point totals

/**
 * Get all questions for a specific class code
 * 
 * Retrieves all questions that have been asked by students in a particular class,
 * ordered by timestamp (newest first).
 * 
 * @param classCode - The code of the class to get questions for
 * @returns A promise that resolves to an array of Question objects
 */
export const getQuestions = async (classCode: string): Promise<Question[]> => {
  if (!classCode) {
    console.warn("getQuestions called without a class code");
    return [];
  }

  try {
    console.log(`Fetching questions for class code: ${classCode}`);
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('classCode', '==', classCode),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Retrieved ${querySnapshot.docs.length} questions`);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text,
      timestamp: doc.data().timestamp,
      status: doc.data().status || 'unanswered',
    }));
  } catch (error) {
    console.error('Error getting questions:', error);
    return [];
  }
};

/**
 * Set up a real-time listener for questions in a class
 * 
 * Creates a Firestore listener that triggers the callback whenever there are changes
 * to the questions in a specific class. The callback receives the updated list of questions.
 * 
 * @param sessionCode - The code of the session to listen for questions in
 * @param callback - Function that receives the updated list of questions
 * @returns An unsubscribe function to stop listening
 */
export const listenForQuestions = (
  sessionCode: string, 
  callback: (questions: Question[]) => void
) => {
  if (!sessionCode) {
    console.error("No session code provided to listenForQuestions");
    callback([]);
    return () => {};
  }

  console.log(`Setting up questions listener for session: ${sessionCode}`);
  
  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        console.log(`Questions snapshot received with ${querySnapshot.docs.length} documents`);
        const questions = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            status: data.status || 'unanswered',
            studentId: data.studentId || "unknown"
          };
        });
        callback(questions);
      }, 
      (error) => {
        console.error("Error in questions listener:", error);
        callback([]);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up questions listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Get questions for a specific user (student) in a class
 * 
 * Retrieves all questions that have been asked by a specific student in a particular class,
 * ordered by timestamp (newest first).
 * 
 * @param userIdentifier - The ID of the user (student) to get questions for
 * @param classCode - The code of the class to get questions from
 * @returns A promise that resolves to an array of Question objects
 */
export const getUserQuestions = async (
  userIdentifier: string = 'student',
  classCode: string
): Promise<Question[]> => {
  if (!userIdentifier || !classCode) {
    console.warn("getUserQuestions called with missing parameters");
    return [];
  }

  try {
    console.log(`Fetching questions for user ${userIdentifier} in class ${classCode}`);
    const q = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('userIdentifier', '==', userIdentifier),
      where('classCode', '==', classCode),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Retrieved ${querySnapshot.docs.length} user questions`);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.questionId || doc.id,
        text: data.text || "No text provided",
        timestamp: data.timestamp || Date.now(),
        status: data.status || 'unanswered',
      };
    });
  } catch (error) {
    console.error('Error getting user questions:', error);
    return [];
  }
};

/**
 * Set up a real-time listener for a specific user's questions
 * 
 * Creates a Firestore listener that triggers the callback whenever there are changes
 * to the questions asked by a specific student in a class. The callback receives 
 * the updated list of questions.
 * 
 * @param userIdentifier - The ID of the user (student) to listen for questions from
 * @param sessionCode - The code of the session to listen in
 * @param callback - Function that receives the updated list of questions
 * @returns An unsubscribe function to stop listening
 */
export const listenForUserQuestions = (
  userIdentifier: string = 'student',
  sessionCode: string,
  callback: (questions: Question[]) => void
) => {
  if (!userIdentifier || !sessionCode) {
    console.error("Missing parameters for listenForUserQuestions");
    callback([]);
    return () => {};
  }

  console.log(`Setting up user questions listener for user ${userIdentifier} in session ${sessionCode}`);
  
  try {
    const q = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('studentId', '==', userIdentifier),
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        console.log(`User questions snapshot received with ${querySnapshot.docs.length} documents`);
        
        // Map each doc to a question, fetching the full question data if needed
        const questionPromises = querySnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          const questionId = data.questionId || docSnapshot.id;
          
          // If we have the questionId, get the full question data
          try {
            const questionDocRef = doc(db, QUESTIONS_COLLECTION, questionId);
            const questionDoc = await getDoc(questionDocRef);
            
            if (questionDoc.exists()) {
              const questionData = questionDoc.data();
              return {
                id: questionId,
                text: questionData.text || "No text provided",
                timestamp: questionData.timestamp || data.timestamp || Date.now(),
                status: questionData.status || 'unanswered',
                studentId: questionData.studentId || userIdentifier
              };
            }
          } catch (error) {
            console.error(`Error getting question ${questionId}:`, error);
          }
          
          // Fallback if we couldn't get the full question data
          return {
            id: questionId,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            status: data.status || 'unanswered',
            studentId: userIdentifier
          };
        });
        
        // Resolve all the promises and send the results to the callback
        Promise.all(questionPromises)
          .then(questions => {
            callback(questions);
          })
          .catch(error => {
            console.error("Error processing user questions:", error);
            callback([]);
          });
      }, 
      (error) => {
        console.error("Error in user questions listener:", error);
        callback([]);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up user questions listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Add a new question from a student
 * 
 * Adds a question to the database with the specified text and associated user/class information.
 * Now works with session codes for temporary class sessions.
 * 
 * @param text - The text content of the question
 * @param studentId - The ID of the student asking the question (defaults to 'student')
 * @param sessionCode - The code for the session the question is being asked in
 * @returns A Promise that resolves to the created Question object or null if creation failed
 */
export const addQuestion = async (
  text: string, 
  studentId: string = 'student',
  sessionCode: string
): Promise<Question | null> => {
  if (!text.trim() || !sessionCode) {
    console.error("Missing question text or session code");
    return null;
  }

  try {
    console.log(`Adding question: "${text}" for session: ${sessionCode} by student: ${studentId}`);
    
    // Create timestamp for tracking
    const timestamp = Date.now();
    
    // Create the question object
    const newQuestion: Omit<Question, "id"> = {
      text: text.trim(),
      timestamp,
      studentId,
      sessionCode,  // Store the session code instead of class code
      status: 'unanswered'
    };
    
    // Add to Firestore
    const docRef = await addDoc(collection(db, QUESTIONS_COLLECTION), newQuestion);
    console.log(`Question added with ID: ${docRef.id}`);
    
    // Track in user questions for easier querying
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
    console.error("Error adding question:", error);
    return null;
  }
};

/**
 * Update an existing question
 * 
 * Updates the text of an existing question in both the global questions collection
 * and the user-specific questions collection.
 * 
 * @param id - The ID of the question to update
 * @param text - The new text content for the question
 * @param userIdentifier - The ID of the user who owns the question
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const updateQuestion = async (
  id: string,
  text: string,
  userIdentifier: string = 'student'
): Promise<boolean> => {
  if (!id || !text || !userIdentifier) {
    console.error("Missing parameters for updateQuestion");
    return false;
  }

  try {
    console.log(`Updating question with ID: ${id}`);
    
    // Update in global questions collection
    const questionRef = doc(db, QUESTIONS_COLLECTION, id);
    await updateDoc(questionRef, {
      text,
      lastEdited: Date.now(),
    });
    
    console.log("Question updated in global collection");
    
    // Find and update in user questions collection
    const userQuestionsQuery = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('questionId', '==', id),
      where('userIdentifier', '==', userIdentifier)
    );
    
    const querySnapshot = await getDocs(userQuestionsQuery);
    console.log(`Found ${querySnapshot.docs.length} user question references to update`);
    
    const updatePromises = querySnapshot.docs.map(doc => 
      updateDoc(doc.ref, {
        text,
        lastEdited: Date.now(),
      })
    );
    
    await Promise.all(updatePromises);
    console.log("All user question references updated");
    
    return true;
  } catch (error) {
    console.error('Error updating question:', error);
    return false;
  }
};

/**
 * Delete a question
 * 
 * Removes a question from both the global questions collection and all
 * user-specific question references in the user questions collection.
 * 
 * @param id - The ID of the question to delete
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const deleteQuestion = async (id: string): Promise<boolean> => {
  if (!id) {
    console.error("No ID provided to deleteQuestion");
    return false;
  }

  try {
    console.log(`Deleting question with ID: ${id}`);
    
    // Delete from global questions
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));
    console.log("Question deleted from global collection");
    
    // Find and delete from user questions
    const userQuestionsQuery = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('questionId', '==', id)
    );
    
    const querySnapshot = await getDocs(userQuestionsQuery);
    console.log(`Found ${querySnapshot.docs.length} user question references to delete`);
    
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    console.log("All user question references deleted");
    
    return true;
  } catch (error) {
    console.error('Error deleting question:', error);
    return false;
  }
};

/**
 * Update the status of a question
 * 
 * Updates the status of a question (e.g., from 'unanswered' to 'answered')
 * in both the global questions collection and all associated user question references.
 * 
 * @param id - The ID of the question to update
 * @param status - The new status ('answered' or 'unanswered')
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const updateQuestionStatus = async (
  id: string,
  status: 'answered' | 'unanswered'
): Promise<boolean> => {
  if (!id) {
    console.error("No ID provided to updateQuestionStatus");
    return false;
  }

  try {
    console.log(`Updating question status with ID: ${id} to ${status}`);
    
    // Update in global questions collection
    const questionRef = doc(db, QUESTIONS_COLLECTION, id);
    await updateDoc(questionRef, {
      status,
      lastUpdated: Date.now(),
    });
    
    console.log("Question status updated in global collection");
    
    // Find and update in user questions collection
    const userQuestionsQuery = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('questionId', '==', id)
    );
    
    const querySnapshot = await getDocs(userQuestionsQuery);
    console.log(`Found ${querySnapshot.docs.length} user question references to update status`);
    
    const updatePromises = querySnapshot.docs.map(doc => 
      updateDoc(doc.ref, {
        status,
        lastUpdated: Date.now(),
      })
    );
    
    await Promise.all(updatePromises);
    console.log("All user question references updated with new status");
    
    return true;
  } catch (error) {
    console.error('Error updating question status:', error);
    return false;
  }
};

/**
 * Add an active question for students to answer
 * 
 * Creates a new active question from a professor in a specific class.
 * Updated to work with session codes instead of class codes.
 * 
 * @param sessionCode - The session code where the question is being asked
 * @param text - The text of the question
 * @returns A Promise that resolves to the ID of the added question or null if failed
 */
export const addActiveQuestion = async (
  sessionCode: string,
  text: string
): Promise<string | null> => {
  if (!text.trim() || !sessionCode) {
    console.error("Missing required fields for active question");
    return null;
  }

  try {
    console.log(`Adding active question: "${text}" for session: ${sessionCode}`);
    
    // Clear any previous active questions and answers
    await clearActiveQuestions(sessionCode);
    await clearPreviousAnswers(sessionCode);
    
    // Create the active question
    const docRef = await addDoc(collection(db, ACTIVE_QUESTION_COLLECTION), {
      text: text.trim(),
      sessionCode,
      timestamp: Date.now()
    });
    
    console.log(`Active question added with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("Error adding active question:", error);
    return null;
  }
};

/**
 * Clear any active questions for a class
 * 
 * Removes all active questions for a specific class, except optionally
 * a specific question to keep. This is used when setting a new active question
 * to clear any previous ones.
 * 
 * @param sessionCode - The code of the session to clear active questions for
 * @param skipId - Optional ID of an active question to keep (not delete)
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const clearActiveQuestions = async (sessionCode: string, skipId?: string): Promise<boolean> => {
  if (!sessionCode) {
    console.error("No session code provided to clearActiveQuestions");
    return false;
  }

  try {
    console.log(`Clearing active questions for session ${sessionCode}${skipId ? ' except ' + skipId : ''}`);
    
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION),
      where('sessionCode', '==', sessionCode)
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} active questions to clear`);
    
    const deletePromises = querySnapshot.docs
      .filter(doc => !skipId || doc.id !== skipId) // Skip the specified ID if provided
      .map(doc => deleteDoc(doc.ref));
    
    await Promise.all(deletePromises);
    console.log("Active questions cleared");
    
    return true;
  } catch (error) {
    console.error('Error clearing active questions:', error);
    return false;
  }
};

/**
 * Clear previous answers for a class
 * 
 * Removes all answers for a specific class. This is used when setting a new active question
 * to clear answers to previous questions.
 * 
 * @param sessionCode - The code of the session to clear answers for
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const clearPreviousAnswers = async (sessionCode: string): Promise<boolean> => {
  if (!sessionCode) {
    console.error("No session code provided to clearPreviousAnswers");
    return false;
  }

  try {
    console.log(`Clearing previous answers for session ${sessionCode}`);
    
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('sessionCode', '==', sessionCode)
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} answers to clear`);
    
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    console.log("All previous answers cleared");
    
    return true;
  } catch (error) {
    console.error('Error clearing previous answers:', error);
    return false;
  }
};

/**
 * Get the current active question for a class
 * 
 * Retrieves the most recent active question for a class.
 * Only retrieves one question (the most recent one).
 * 
 * @param sessionCode - The code of the session to get the active question for
 * @returns A promise that resolves to the active question object, or null if none found
 */
export const getActiveQuestion = async (sessionCode: string): Promise<{id: string, text: string, timestamp: number} | null> => {
  if (!sessionCode) {
    console.warn("getActiveQuestion called without a session code");
    return null;
  }

  try {
    console.log(`Fetching active question for session code: ${sessionCode}`);
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log("No active question found");
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    return {
      id: doc.id,
      text: data.text || "No text provided",
      timestamp: data.timestamp || Date.now(),
    };
  } catch (error) {
    console.error('Error getting active question:', error);
    return null;
  }
};

/**
 * Set up a real-time listener for the active question in a class
 * 
 * Creates a Firestore listener that triggers the callback whenever there are changes
 * to the active question in a class. The callback receives the updated active question.
 * This function also immediately fetches the current active question to provide
 * faster initial data loading.
 * 
 * @param sessionCode - The code of the session to listen for active questions in
 * @param callback - Function that receives the updated active question or null if none exists
 * @returns An unsubscribe function to stop listening
 */
export const listenForActiveQuestion = (
  sessionCode: string, 
  callback: (question: {id: string, text: string, timestamp: number} | null) => void
) => {
  if (!sessionCode) {
    console.error("No session code provided to listenForActiveQuestion");
    callback(null);
    return () => {};
  }

  console.log(`Setting up active question listener for session: ${sessionCode}`);
  
  try {
    // First, do a direct fetch to get the current active question immediately
    const fetchCurrentQuestion = async () => {
      try {
        const currentQuestion = await getActiveQuestion(sessionCode);
        if (currentQuestion) {
          console.log("Initial active question fetch:", currentQuestion);
          callback(currentQuestion);
        }
      } catch (error) {
        console.error("Error fetching initial active question:", error);
      }
    };
    
    // Start the fetch immediately
    fetchCurrentQuestion();
    
    // Then set up the real-time listener for future updates
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION), 
      where('sessionCode', '==', sessionCode),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        if (querySnapshot.empty) {
          console.log("No active question found in listener");
          callback(null);
          return;
        }
        
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        
        callback({
          id: doc.id,
          text: data.text || "No text provided",
          timestamp: data.timestamp || Date.now(),
        });
      }, 
      (error) => {
        console.error("Error in active question listener:", error);
        callback(null);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up active question listener:", error);
    callback(null);
    return () => {};
  }
};

/**
 * Add an answer to an active question
 * 
 * Stores a student's answer to a currently active question.
 * Updated to work with session codes and use a more structured input format.
 * 
 * @param answerData - Object containing the answer data:
 *   - text: The text of the answer
 *   - activeQuestionId: The ID of the active question being answered
 *   - studentId: The ID of the student providing the answer
 *   - sessionCode: The session code for the class
 *   - questionText: Optional text of the question being answered
 * @returns A Promise that resolves to the ID of the added answer or null if failed
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
    console.error("Missing required fields for answer");
    return null;
  }

  try {
    console.log(`Adding answer for question: ${activeQuestionId} by student: ${studentId}`);
    
    // Check if this student has already answered this question
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('activeQuestionId', '==', activeQuestionId),
      where('studentId', '==', studentId)
    );
    
    const existingAnswers = await getDocs(q);
    
    // If student already answered, update their answer
    if (!existingAnswers.empty) {
      const existingAnswer = existingAnswers.docs[0];
      await updateDoc(doc(db, ANSWERS_COLLECTION, existingAnswer.id), {
        text: text.trim(),
        timestamp: Date.now(),
        updated: true
      });
      
      console.log(`Updated existing answer with ID: ${existingAnswer.id}`);
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
    
    console.log(`Answer added with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("Error adding answer:", error);
    return null;
  }
};

/**
 * Get answers for an active question
 * 
 * Retrieves all answers submitted for a specific active question,
 * ordered by timestamp (oldest first).
 * 
 * @param activeQuestionId - The ID of the active question to get answers for
 * @returns A promise that resolves to an array of answer objects
 */
export const getAnswers = async (activeQuestionId: string): Promise<{id: string, text: string, timestamp: number, studentId: string}[]> => {
  if (!activeQuestionId) {
    console.warn("getAnswers called without an active question ID");
    return [];
  }

  try {
    console.log(`Fetching answers for question ID: ${activeQuestionId}`);
    const q = query(
      collection(db, ANSWERS_COLLECTION), 
      where('activeQuestionId', '==', activeQuestionId),
      orderBy('timestamp', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Retrieved ${querySnapshot.docs.length} answers`);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text || "No text provided",
        timestamp: data.timestamp || Date.now(),
        studentId: data.studentId || "unknown",
      };
    });
  } catch (error) {
    console.error('Error getting answers:', error);
    return [];
  }
};

/**
 * Set up a real-time listener for answers to an active question
 * 
 * Creates a Firestore listener that triggers the callback whenever there are changes
 * to the answers for an active question. The callback receives the updated list of answers.
 * This function also fetches the question text and includes it with each answer.
 * 
 * @param activeQuestionId - The ID of the active question to listen for answers to
 * @param callback - Function that receives the updated list of answers
 * @returns An unsubscribe function to stop listening
 */
export const listenForAnswers = (
  activeQuestionId: string, 
  callback: (answers: {id: string, text: string, timestamp: number, studentId: string, questionText?: string}[]) => void
) => {
  if (!activeQuestionId) {
    console.error("No active question ID provided to listenForAnswers");
    callback([]);
    return () => {};
  }

  console.log(`Setting up answers listener for question: ${activeQuestionId}`);
  
  try {
    const q = query(
      collection(db, ANSWERS_COLLECTION), 
      where('activeQuestionId', '==', activeQuestionId),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, 
      async (querySnapshot) => {
        console.log(`Answers snapshot received with ${querySnapshot.docs.length} documents`);
        
        // Get the question text if there are answers
        let questionText = "";
        if (querySnapshot.docs.length > 0) {
          try {
            const activeQuestionRef = doc(db, ACTIVE_QUESTION_COLLECTION, activeQuestionId);
            const activeQuestionDoc = await getDoc(activeQuestionRef);
            if (activeQuestionDoc.exists()) {
              questionText = activeQuestionDoc.data().text || "";
            }
          } catch (error) {
            console.error("Error getting active question text:", error);
          }
        }
        
        const answers = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            studentId: data.studentId || "unknown",
            questionText,
            activeQuestionId
          };
        });
        callback(answers);
      }, 
      (error) => {
        console.error("Error in answers listener:", error);
        callback([]);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up answers listener:", error);
    callback([]);
    return () => {};
  }
};

/**
 * Update a student's points
 * 
 * Updates the total points for a student, ensuring the total never goes below zero.
 * This is used by professors to award points for good answers.
 * 
 * @param studentId - The ID of the student to update points for
 * @param points - The number of points to add (or subtract if negative)
 * @returns A promise that resolves when the points have been updated
 */
export async function updateStudentPoints(studentId: string, points: number): Promise<void> {
  try {
    // Store points in a dedicated collection with minimal data
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    
    // Get current points from Firestore
    const pointsDoc = await getDoc(pointsRef);
    const currentPoints = pointsDoc.exists() ? (pointsDoc.data().total || 0) : 0;
    
    // Calculate new total, ensuring it doesn't go below zero
    const newTotal = Math.max(0, currentPoints + points);
    
    // Update points in Firestore
    await setDoc(pointsRef, { 
      total: newTotal,
      lastUpdated: Date.now() 
    }, { merge: true });
    
    console.log(`Points updated for student ${studentId}: ${points} points adjusted, new total: ${newTotal}`);
  } catch (error) {
    console.error('Error updating student points:', error);
    throw error;
  }
}

/**
 * Get a student's current points total
 * 
 * Retrieves the current total points for a specific student.
 * 
 * @param studentId - The ID of the student to get points for
 * @returns A promise that resolves to the student's current point total
 */
export async function getStudentPoints(studentId: string): Promise<number> {
  try {
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    const pointsDoc = await getDoc(pointsRef);
    
    if (pointsDoc.exists()) {
      return pointsDoc.data().total || 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error getting student points:', error);
    return 0;
  }
}

/**
 * Set up a real-time listener for a student's points
 * 
 * Creates a Firestore listener that triggers the callback whenever there are changes
 * to a student's points. The callback receives the updated point total.
 * 
 * @param studentId - The ID of the student to listen for point changes
 * @param callback - Function that receives the updated point total
 * @returns An unsubscribe function to stop listening
 */
export function listenForStudentPoints(
  studentId: string,
  callback: (points: number) => void
): () => void {
  if (!studentId) {
    console.error("No student ID provided to listenForStudentPoints");
    callback(0);
    return () => {};
  }

  console.log(`Setting up points listener for student: ${studentId}`);
  
  try {
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    
    const unsubscribe = onSnapshot(pointsRef, 
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const total = docSnapshot.data().total || 0;
          console.log(`Points update received for student ${studentId}: ${total} points`);
          callback(total);
        } else {
          console.log(`No points record found for student ${studentId}`);
          callback(0);
        }
      }, 
      (error) => {
        console.error("Error in points listener:", error);
        callback(0);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up points listener:", error);
    callback(0);
    return () => {};
  }
}

/**
 * Clean up inactive class sessions
 * 
 * Removes class sessions that haven't been active for the specified number of hours.
 * This helps keep the database clean and reduces storage costs.
 * 
 * @param inactiveHours - Number of hours of inactivity before a session is considered inactive (default: 2)
 * @returns A promise that resolves to the number of sessions deleted
 */
export async function cleanupInactiveClassSessions(inactiveHours: number = 2): Promise<number> {
  try {
    console.log(`Cleaning up class sessions inactive for ${inactiveHours} hours or more`);
    
    // Calculate the cutoff timestamp (current time - inactiveHours)
    const cutoffTimestamp = Date.now() - (inactiveHours * 60 * 60 * 1000);
    
    // Query for sessions that haven't been updated since the cutoff time
    const sessionsQuery = query(
      collection(db, 'classSessions'),
      where('lastActive', '<', cutoffTimestamp)
    );
    
    const querySnapshot = await getDocs(sessionsQuery);
    console.log(`Found ${querySnapshot.docs.length} inactive class sessions to clean up`);
    
    if (querySnapshot.empty) {
      console.log('No inactive sessions to clean up');
      return 0;
    }
    
    // Delete inactive sessions in batches to avoid overwhelming Firestore
    const batchSize = 20; // Use smaller batch size to avoid overwhelming Firestore
    let deletedCount = 0;
    let batchFailed = false;
    
    // First try batch operations
    for (let i = 0; i < querySnapshot.docs.length && !batchFailed; i += batchSize) {
      const batchDocs = querySnapshot.docs.slice(i, i + batchSize);
      try {
        // Use a writeBatch for better performance with multiple deletes
        const batch = writeBatch(db);
        batchDocs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += batchDocs.length;
        console.log(`Deleted batch of ${batchDocs.length} inactive sessions (${deletedCount}/${querySnapshot.docs.length} total)`);
      } catch (error) {
        console.error(`Error deleting batch of inactive sessions:`, error);
        batchFailed = true;
        console.log('Batch operations failed, falling back to individual deletions');
      }
    }
    
    // If batch operations failed, fall back to individual deletions
    if (batchFailed) {
      console.log('Attempting individual deletions for remaining inactive sessions');
      const remainingSessions = querySnapshot.docs.slice(deletedCount);
      
      for (const sessionDoc of remainingSessions) {
        try {
          await deleteDoc(sessionDoc.ref);
          deletedCount++;
          
          if (deletedCount % 10 === 0) {
            console.log(`Deleted ${deletedCount}/${querySnapshot.docs.length} inactive sessions`);
          }
        } catch (error) {
          console.error(`Error deleting individual session ${sessionDoc.id}:`, error);
          // Continue with other sessions even if one fails
        }
      }
    }
    
    console.log(`Successfully deleted ${deletedCount}/${querySnapshot.docs.length} inactive class sessions`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up inactive class sessions:', error);
    return 0;
  }
}

/**
 * Clean up orphaned answers
 * 
 * Removes answers whose associated active questions have been deleted.
 * This helps keep the database clean and avoids showing answers to questions 
 * that no longer exist.
 * 
 * @returns A promise that resolves to the number of orphaned answers deleted
 */
export async function cleanupOrphanedAnswers(): Promise<number> {
  try {
    console.log('Cleaning up orphaned answers');
    
    // Get all answers
    const answersSnapshot = await getDocs(collection(db, ANSWERS_COLLECTION));
    console.log(`Found ${answersSnapshot.docs.length} total answers to check`);
    
    if (answersSnapshot.empty) {
      console.log('No answers to check, skipping cleanup');
      return 0;
    }
    
    // For each answer, check if its question still exists
    const orphanedAnswers = [];
    const batchSize = 20; // Use smaller batch size to avoid overwhelming Firestore
    let processedCount = 0;
    
    for (const answerDoc of answersSnapshot.docs) {
      try {
        const answerData = answerDoc.data();
        const questionId = answerData.activeQuestionId;
        
        if (!questionId) {
          orphanedAnswers.push(answerDoc);
          continue;
        }
        
        // Check if the question exists
        const questionRef = doc(db, ACTIVE_QUESTION_COLLECTION, questionId);
        const questionDoc = await getDoc(questionRef);
        
        if (!questionDoc.exists()) {
          orphanedAnswers.push(answerDoc);
        }
        
        // Log progress for large collections
        processedCount++;
        if (processedCount % 20 === 0) {
          console.log(`Processed ${processedCount}/${answersSnapshot.docs.length} answers`);
        }
      } catch (error) {
        console.error(`Error checking answer ${answerDoc.id}:`, error);
        // Continue with other answers even if one fails
      }
    }
    
    console.log(`Found ${orphanedAnswers.length} orphaned answers to delete`);
    
    if (orphanedAnswers.length === 0) {
      return 0;
    }
    
    // Delete orphaned answers in batches to avoid overwhelming Firestore
    let deletedCount = 0;
    let batchFailed = false;
    
    // First try batch operations
    for (let i = 0; i < orphanedAnswers.length && !batchFailed; i += batchSize) {
      const batchDocs = orphanedAnswers.slice(i, i + batchSize);
      try {
        // Use a writeBatch for better performance with multiple deletes
        const batch = writeBatch(db);
        batchDocs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += batchDocs.length;
        console.log(`Deleted batch of ${batchDocs.length} orphaned answers (${deletedCount}/${orphanedAnswers.length} total)`);
      } catch (error) {
        console.error(`Error deleting batch of orphaned answers:`, error);
        batchFailed = true;
        console.log('Batch operations failed, falling back to individual deletions');
      }
    }
    
    // If batch operations failed, fall back to individual deletions
    if (batchFailed) {
      console.log('Attempting individual deletions for remaining orphaned answers');
      const remainingAnswers = orphanedAnswers.slice(deletedCount);
      
      for (const answerDoc of remainingAnswers) {
        try {
          await deleteDoc(answerDoc.ref);
          deletedCount++;
          
          if (deletedCount % 10 === 0) {
            console.log(`Deleted ${deletedCount}/${orphanedAnswers.length} orphaned answers`);
          }
        } catch (error) {
          console.error(`Error deleting individual answer ${answerDoc.id}:`, error);
          // Continue with other answers even if one fails
        }
      }
    }
    
    console.log(`Successfully deleted ${deletedCount}/${orphanedAnswers.length} orphaned answers`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up orphaned answers:', error);
    return 0;
  }
}

/**
 * Run all database maintenance tasks
 * 
 * Executes all maintenance operations to keep the database clean and efficient.
 * This includes cleaning up inactive sessions and orphaned answers.
 * The function handles errors gracefully and will not fail if one task fails.
 * 
 * @returns A promise that resolves to an object containing the results of all maintenance tasks
 */
export async function runDatabaseMaintenance(): Promise<{
  inactiveSessionsDeleted: number;
  orphanedAnswersDeleted: number;
}> {
  try {
    console.log('Starting database maintenance tasks');
    
    // Run all maintenance tasks in parallel with individual error handling
    const results = await Promise.allSettled([
      cleanupInactiveClassSessions().catch(error => {
        console.error('Error cleaning up inactive sessions:', error);
        return 0;
      }),
      cleanupOrphanedAnswers().catch(error => {
        console.error('Error cleaning up orphaned answers:', error);
        return 0;
      })
    ]);
    
    // Extract results, defaulting to 0 if a task failed
    const inactiveSessionsDeleted = results[0].status === 'fulfilled' ? results[0].value : 0;
    const orphanedAnswersDeleted = results[1].status === 'fulfilled' ? results[1].value : 0;
    
    console.log('Database maintenance completed with results:', {
      inactiveSessionsDeleted,
      orphanedAnswersDeleted
    });
    
    return {
      inactiveSessionsDeleted,
      orphanedAnswersDeleted
    };
  } catch (error) {
    console.error('Error running database maintenance:', error);
    // Return zeros instead of throwing, so the app continues to work
    return {
      inactiveSessionsDeleted: 0,
      orphanedAnswersDeleted: 0
    };
  }
} 