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
  console.log(`Generated class code: ${result}`);
  return result;
};

// Create a new class code in Firestore
export const createClassCode = async (code: string, professorId: string): Promise<boolean> => {
  if (!code || !professorId) {
    console.error("Missing parameters for createClassCode");
    return false;
  }

  try {
    console.log(`Creating class code ${code} for professor ${professorId}`);
    
    // Check if code already exists
    const existingCode = await getClassCodeDoc(code);
    if (existingCode) {
      console.warn(`Class code ${code} already exists`);
      return false;
    }
    
    // Add the class code to Firestore
    const docRef = await addDoc(collection(db, CLASS_CODES_COLLECTION), {
      code,
      professorId,
      createdAt: Date.now()
    });
    
    console.log(`Class code created with ID: ${docRef.id}`);
    return true;
  } catch (error) {
    console.error('Error creating class code:', error);
    return false;
  }
};

// Get a class code document
export const getClassCodeDoc = async (code: string) => {
  if (!code) {
    console.error("No code provided to getClassCodeDoc");
    return null;
  }

  try {
    console.log(`Looking up class code: ${code}`);
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('code', '==', code)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log(`No class code found for: ${code}`);
      return null;
    }
    
    console.log(`Found class code document with ID: ${querySnapshot.docs[0].id}`);
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
  if (!professorId) {
    console.error("No professor ID provided to getClassCodeForProfessor");
    return null;
  }

  try {
    console.log(`Looking up class code for professor: ${professorId}`);
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('professorId', '==', professorId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log(`No class code found for professor: ${professorId}`);
      return null;
    }
    
    const code = querySnapshot.docs[0].data().code;
    console.log(`Found class code for professor: ${code}`);
    return code;
  } catch (error) {
    console.error('Error getting class code for professor:', error);
    return null;
  }
};

// Join a class
export const joinClass = async (code: string, studentId: string): Promise<boolean> => {
  if (!code || !studentId) {
    console.error("Missing parameters for joinClass");
    return false;
  }

  try {
    console.log(`Student ${studentId} attempting to join class with code: ${code}`);
    
    // Check if the class code exists
    const classCodeDoc = await getClassCodeDoc(code);
    if (!classCodeDoc) {
      console.warn(`Invalid class code: ${code}`);
      return false;
    }
    
    // Add to joined classes
    const docRef = await addDoc(collection(db, JOINED_CLASSES_COLLECTION), {
      classCode: code,
      studentId,
      joinedAt: Date.now()
    });
    
    console.log(`Student joined class. Document ID: ${docRef.id}`);
    return true;
  } catch (error) {
    console.error('Error joining class:', error);
    return false;
  }
};

// Get joined class for a student
export const getJoinedClass = async (studentId: string): Promise<string | null> => {
  if (!studentId) {
    console.error("No student ID provided to getJoinedClass");
    return null;
  }

  try {
    console.log(`Looking up joined class for student: ${studentId}`);
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log(`No joined class found for student: ${studentId}`);
      return null;
    }
    
    const classCode = querySnapshot.docs[0].data().classCode;
    console.log(`Found joined class for student: ${classCode}`);
    return classCode;
  } catch (error) {
    console.error('Error getting joined class:', error);
    return null;
  }
};

// Leave a class
export const leaveClass = async (studentId: string): Promise<boolean> => {
  if (!studentId) {
    console.error("No student ID provided to leaveClass");
    return false;
  }

  try {
    console.log(`Student ${studentId} leaving class`);
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.warn(`No joined class found for student: ${studentId}`);
      return false;
    }
    
    console.log(`Found ${querySnapshot.docs.length} joined class records to delete`);
    
    // Delete all joined classes for this student
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    console.log("Student successfully left class");
    return true;
  } catch (error) {
    console.error('Error leaving class:', error);
    return false;
  }
};

// Validate a class code
export const validateClassCode = async (code: string): Promise<boolean> => {
  if (!code) {
    console.error("No code provided to validateClassCode");
    return false;
  }

  try {
    console.log(`Validating class code: ${code}`);
    const classCodeDoc = await getClassCodeDoc(code);
    const isValid = classCodeDoc !== null;
    console.log(`Class code ${code} is ${isValid ? 'valid' : 'invalid'}`);
    return isValid;
  } catch (error) {
    console.error('Error validating class code:', error);
    return false;
  }
}; 