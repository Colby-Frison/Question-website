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
  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where('classCode', '==', classCode),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
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
  const q = query(
    collection(db, QUESTIONS_COLLECTION), 
    where('classCode', '==', classCode),
    orderBy('timestamp', 'desc')
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const questions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text,
      timestamp: doc.data().timestamp,
    }));
    callback(questions);
  });
};

// Get questions for a specific user (student)
export const getUserQuestions = async (
  userIdentifier: string = 'student',
  classCode: string
): Promise<Question[]> => {
  try {
    const q = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('userIdentifier', '==', userIdentifier),
      where('classCode', '==', classCode),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.data().questionId,
      text: doc.data().text,
      timestamp: doc.data().timestamp,
    }));
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
  const q = query(
    collection(db, USER_QUESTIONS_COLLECTION),
    where('userIdentifier', '==', userIdentifier),
    where('classCode', '==', classCode),
    orderBy('timestamp', 'desc')
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const questions = querySnapshot.docs.map(doc => ({
      id: doc.data().questionId,
      text: doc.data().text,
      timestamp: doc.data().timestamp,
    }));
    callback(questions);
  });
};

// Add a new question
export const addQuestion = async (
  text: string, 
  userIdentifier: string = 'student',
  classCode: string
): Promise<Question | null> => {
  try {
    // Create a timestamp
    const timestamp = Date.now();
    
    // Add to global questions collection
    const questionRef = await addDoc(collection(db, QUESTIONS_COLLECTION), {
      text,
      timestamp,
      classCode,
      // No user identifier here to maintain anonymity
    });
    
    // Add to user's questions collection (for tracking their own questions)
    await addDoc(collection(db, USER_QUESTIONS_COLLECTION), {
      questionId: questionRef.id, // Reference to the original question
      text,
      timestamp,
      userIdentifier,
      classCode,
    });
    
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
  try {
    // Delete from global questions
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));
    
    // Find and delete from user questions
    const userQuestionsQuery = query(
      collection(db, USER_QUESTIONS_COLLECTION),
      where('questionId', '==', id)
    );
    
    const querySnapshot = await getDocs(userQuestionsQuery);
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error('Error deleting question:', error);
    return false;
  }
}; 