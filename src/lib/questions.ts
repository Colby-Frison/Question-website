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
  onSnapshot 
} from 'firebase/firestore';

// Collection references
const QUESTIONS_COLLECTION = 'questions';
const USER_QUESTIONS_COLLECTION = 'userQuestions';

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
    });
    
    console.log(`Question added with ID: ${questionRef.id}`);
    
    // Add to user's questions collection (for tracking their own questions)
    await addDoc(collection(db, USER_QUESTIONS_COLLECTION), {
      questionId: questionRef.id, // Reference to the original question
      text,
      timestamp,
      userIdentifier,
      classCode,
    });
    
    console.log("User question reference added");
    
    return {
      id: questionRef.id,
      text,
      timestamp,
    };
  } catch (error) {
    console.error('Error adding question:', error);
    return null;
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