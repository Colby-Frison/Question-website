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
  setDoc
} from 'firebase/firestore';
import { getUserId } from '@/lib/auth';

// Collection references
const QUESTIONS_COLLECTION = 'questions';
const USER_QUESTIONS_COLLECTION = 'userQuestions';
const ACTIVE_QUESTION_COLLECTION = 'activeQuestions';
const ANSWERS_COLLECTION = 'answers';

// Get all questions for a specific class code
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

// Set up a real-time listener for questions
export const listenForQuestions = (
  classCode: string, 
  callback: (questions: Question[]) => void
) => {
  if (!classCode) {
    console.error("No class code provided to listenForQuestions");
    callback([]);
    return () => {};
  }

  console.log(`Setting up questions listener for class: ${classCode}`);
  
  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('classCode', '==', classCode),
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

// Get questions for a specific user (student)
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

// Set up a real-time listener for user questions
export const listenForUserQuestions = (
  userIdentifier: string = 'student',
  classCode: string,
  callback: (questions: Question[]) => void
) => {
  if (!userIdentifier || !classCode) {
    console.error("Missing parameters for listenForUserQuestions");
    callback([]);
    return () => {};
  }

  console.log(`Setting up user questions listener for user ${userIdentifier} in class ${classCode}`);
  
  try {
    const q = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('userIdentifier', '==', userIdentifier),
      where('classCode', '==', classCode),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        console.log(`User questions snapshot received with ${querySnapshot.docs.length} documents`);
        const questions = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: data.questionId || doc.id,
            text: data.text || "No text provided",
            timestamp: data.timestamp || Date.now(),
            status: data.status || 'unanswered',
          };
        });
        callback(questions);
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

// Add a new question
export const addQuestion = async (
  text: string, 
  userIdentifier: string = 'student',
  classCode: string
): Promise<Question | null> => {
  if (!text || !userIdentifier || !classCode) {
    console.error("Missing parameters for addQuestion");
    return null;
  }

  try {
    console.log(`Adding question for user ${userIdentifier} in class ${classCode}`);
    
    // Create a timestamp
    const timestamp = Date.now();
    
    // Add to global questions collection
    const questionRef = await addDoc(collection(db, QUESTIONS_COLLECTION), {
      text,
      timestamp,
      classCode,
      userIdentifier, // Include userIdentifier for security rules
      status: 'unanswered', // Default status
    });
    
    console.log(`Question added with ID: ${questionRef.id}`);
    
    // Add to user's questions collection (for tracking their own questions)
    await addDoc(collection(db, USER_QUESTIONS_COLLECTION), {
      questionId: questionRef.id, // Reference to the original question
      text,
      timestamp,
      userIdentifier,
      classCode,
      status: 'unanswered', // Default status
    });
    
    console.log("User question reference added");
    
    return {
      id: questionRef.id,
      text,
      timestamp,
      status: 'unanswered',
    };
  } catch (error) {
    console.error('Error adding question:', error);
    return null;
  }
};

// Update an existing question
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

// Delete a question
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

// Update question status
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

// Add a new active question (for professors)
export const addActiveQuestion = async (
  text: string,
  professorId: string,
  classCode: string
): Promise<string | null> => {
  if (!text || !professorId || !classCode) {
    console.error("Missing parameters for addActiveQuestion");
    return null;
  }

  try {
    console.log(`Adding active question for class ${classCode}`);
    
    // Create a timestamp
    const timestamp = Date.now();
    
    // Add the new active question first to make it appear faster
    const questionRef = await addDoc(collection(db, ACTIVE_QUESTION_COLLECTION), {
      text,
      timestamp,
      classCode,
      professorId,
      answers: [],
    });
    
    console.log(`Active question added with ID: ${questionRef.id}`);
    
    // Then clear existing active questions and previous answers in parallel
    // This way the new question appears immediately while cleanup happens in background
    Promise.all([
      clearActiveQuestions(classCode, questionRef.id), // Skip the one we just added
      clearPreviousAnswers(classCode)
    ]).catch(error => {
      console.error('Error in background cleanup:', error);
    });
    
    return questionRef.id;
  } catch (error) {
    console.error('Error adding active question:', error);
    return null;
  }
};

// Clear existing active questions for a class
export const clearActiveQuestions = async (classCode: string, skipId?: string): Promise<boolean> => {
  if (!classCode) {
    console.error("No class code provided to clearActiveQuestions");
    return false;
  }

  try {
    console.log(`Clearing active questions for class ${classCode}`);
    
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION),
      where('classCode', '==', classCode)
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.docs.length} active questions to clear`);
    
    const deletePromises = querySnapshot.docs
      .filter(doc => !skipId || doc.id !== skipId) // Skip the specified ID if provided
      .map(doc => deleteDoc(doc.ref));
    
    await Promise.all(deletePromises);
    console.log("All active questions cleared");
    
    return true;
  } catch (error) {
    console.error('Error clearing active questions:', error);
    return false;
  }
};

// Clear answers for previous questions
export const clearPreviousAnswers = async (classCode: string): Promise<boolean> => {
  if (!classCode) {
    console.error("No class code provided to clearPreviousAnswers");
    return false;
  }

  try {
    console.log(`Clearing previous answers for class ${classCode}`);
    
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('classCode', '==', classCode)
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

// Get the current active question for a class
export const getActiveQuestion = async (classCode: string): Promise<{id: string, text: string, timestamp: number} | null> => {
  if (!classCode) {
    console.warn("getActiveQuestion called without a class code");
    return null;
  }

  try {
    console.log(`Fetching active question for class code: ${classCode}`);
    const q = query(
      collection(db, ACTIVE_QUESTION_COLLECTION), 
      where('classCode', '==', classCode),
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

// Set up a real-time listener for the active question
export const listenForActiveQuestion = (
  classCode: string, 
  callback: (question: {id: string, text: string, timestamp: number} | null) => void
) => {
  if (!classCode) {
    console.error("No class code provided to listenForActiveQuestion");
    callback(null);
    return () => {};
  }

  console.log(`Setting up active question listener for class: ${classCode}`);
  
  try {
    // First, do a direct fetch to get the current active question immediately
    const fetchCurrentQuestion = async () => {
      try {
        const currentQuestion = await getActiveQuestion(classCode);
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
      where('classCode', '==', classCode),
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

// Add an answer to the active question
export const addAnswer = async (
  activeQuestionId: string,
  text: string,
  studentId: string,
  classCode: string
): Promise<string | null> => {
  if (!activeQuestionId || !text || !studentId || !classCode) {
    console.error("Missing parameters for addAnswer");
    return null;
  }

  try {
    console.log(`Adding answer for question ${activeQuestionId}`);
    
    // Create a timestamp
    const timestamp = Date.now();
    
    // Add the answer
    const answerRef = await addDoc(collection(db, ANSWERS_COLLECTION), {
      activeQuestionId,
      text,
      timestamp,
      studentId,
      classCode,
    });
    
    console.log(`Answer added with ID: ${answerRef.id}`);
    return answerRef.id;
  } catch (error) {
    console.error('Error adding answer:', error);
    return null;
  }
};

// Get answers for an active question
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

// Set up a real-time listener for answers to an active question
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

export async function updateStudentPoints(studentId: string, points: number): Promise<void> {
  try {
    // Store points in a dedicated collection with minimal data
    const pointsRef = doc(db, 'studentPoints', studentId);
    
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

// Add a function to get student points
export async function getStudentPoints(studentId: string): Promise<number> {
  try {
    const pointsRef = doc(db, 'studentPoints', studentId);
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

// Add a function to listen for student points changes
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
    const pointsRef = doc(db, 'studentPoints', studentId);
    
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

// Add a function to clean up inactive class sessions
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
    
    // Delete all inactive sessions
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    console.log(`Successfully deleted ${querySnapshot.docs.length} inactive class sessions`);
    return querySnapshot.docs.length;
  } catch (error) {
    console.error('Error cleaning up inactive class sessions:', error);
    return 0;
  }
}

// Add a function to clean up orphaned answers (answers whose questions have been deleted)
export async function cleanupOrphanedAnswers(): Promise<number> {
  try {
    console.log('Cleaning up orphaned answers');
    
    // Get all answers
    const answersSnapshot = await getDocs(collection(db, ANSWERS_COLLECTION));
    console.log(`Found ${answersSnapshot.docs.length} total answers to check`);
    
    // For each answer, check if its question still exists
    const orphanedAnswers = [];
    
    for (const answerDoc of answersSnapshot.docs) {
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
    }
    
    console.log(`Found ${orphanedAnswers.length} orphaned answers to delete`);
    
    // Delete all orphaned answers
    const deletePromises = orphanedAnswers.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    console.log(`Successfully deleted ${orphanedAnswers.length} orphaned answers`);
    return orphanedAnswers.length;
  } catch (error) {
    console.error('Error cleaning up orphaned answers:', error);
    return 0;
  }
}

// Add a function to run all maintenance tasks
export async function runDatabaseMaintenance(): Promise<{
  inactiveSessionsDeleted: number;
  orphanedAnswersDeleted: number;
}> {
  try {
    console.log('Starting database maintenance tasks');
    
    // Run all maintenance tasks in parallel
    const [inactiveSessionsDeleted, orphanedAnswersDeleted] = await Promise.all([
      cleanupInactiveClassSessions(),
      cleanupOrphanedAnswers()
    ]);
    
    console.log('Database maintenance completed successfully');
    return {
      inactiveSessionsDeleted,
      orphanedAnswersDeleted
    };
  } catch (error) {
    console.error('Error running database maintenance:', error);
    return {
      inactiveSessionsDeleted: 0,
      orphanedAnswersDeleted: 0
    };
  }
} 