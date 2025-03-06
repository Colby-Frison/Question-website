import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';

// Collection reference
const CLASS_CODES_COLLECTION = 'classCodes';
const JOINED_CLASSES_COLLECTION = 'joinedClasses';

// Generate a random class code
export const generateClassCode = (): string => {
  // Generate a random 6-character alphanumeric code
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Create a new class code in Firestore
export const createClassCode = async (code: string, professorId: string): Promise<boolean> => {
  try {
    // Check if code already exists
    const existingCode = await getClassCodeDoc(code);
    if (existingCode) {
      return false;
    }
    
    // Add the class code to Firestore
    await addDoc(collection(db, CLASS_CODES_COLLECTION), {
      code,
      professorId,
      createdAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error creating class code:', error);
    return false;
  }
};

// Get a class code document
export const getClassCodeDoc = async (code: string) => {
  try {
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('code', '==', code)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    return {
      id: querySnapshot.docs[0].id,
      ...querySnapshot.docs[0].data()
    };
  } catch (error) {
    console.error('Error getting class code:', error);
    return null;
  }
};

// Get a class code for a professor
export const getClassCodeForProfessor = async (professorId: string): Promise<string | null> => {
  try {
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('professorId', '==', professorId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    return querySnapshot.docs[0].data().code;
  } catch (error) {
    console.error('Error getting class code for professor:', error);
    return null;
  }
};

// Join a class
export const joinClass = async (code: string, studentId: string): Promise<boolean> => {
  try {
    // Check if the class code exists
    const classCodeDoc = await getClassCodeDoc(code);
    if (!classCodeDoc) {
      return false;
    }
    
    // Add to joined classes
    await addDoc(collection(db, JOINED_CLASSES_COLLECTION), {
      classCode: code,
      studentId,
      joinedAt: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error joining class:', error);
    return false;
  }
};

// Get joined class for a student
export const getJoinedClass = async (studentId: string): Promise<string | null> => {
  try {
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    return querySnapshot.docs[0].data().classCode;
  } catch (error) {
    console.error('Error getting joined class:', error);
    return null;
  }
};

// Leave a class
export const leaveClass = async (studentId: string): Promise<boolean> => {
  try {
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return false;
    }
    
    // Delete all joined classes for this student
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error('Error leaving class:', error);
    return false;
  }
};

// Validate a class code
export const validateClassCode = async (code: string): Promise<boolean> => {
  const classCodeDoc = await getClassCodeDoc(code);
  return classCodeDoc !== null;
}; 