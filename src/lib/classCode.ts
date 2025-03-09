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

// Collection reference - keeping the same collection names for backward compatibility
const CLASS_CODES_COLLECTION = 'classCodes';
const JOINED_CLASSES_COLLECTION = 'joinedClasses';

// Validate class name format
export const validateClassName = (name: string): boolean => {
  // Class name should be at least 3 characters and contain only letters, numbers, and spaces
  const regex = /^[a-zA-Z0-9 ]{3,30}$/;
  return regex.test(name);
};

// Format class name (trim and capitalize)
export const formatClassName = (name: string): string => {
  return name.trim();
};

// Create a new class in Firestore
export const createClass = async (className: string, professorId: string): Promise<boolean> => {
  if (!className || !professorId) {
    console.error("Missing parameters for createClass");
    return false;
  }

  try {
    console.log(`Creating class "${className}" for professor ${professorId}`);
    
    // Check if class name already exists
    const existingClass = await getClassByName(className);
    if (existingClass) {
      console.warn(`Class name "${className}" already exists`);
      return false;
    }
    
    // Add the class to Firestore
    const docRef = await addDoc(collection(db, CLASS_CODES_COLLECTION), {
      code: className, // Using 'code' field for backward compatibility
      className: className,
      professorId,
      createdAt: Date.now()
    });
    
    console.log(`Class created with ID: ${docRef.id}`);
    return true;
  } catch (error) {
    console.error('Error creating class:', error);
    return false;
  }
};

// Get a class by name
export const getClassByName = async (className: string) => {
  if (!className) {
    console.error("No class name provided to getClassByName");
    return null;
  }

  try {
    console.log(`Looking up class: "${className}"`);
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('className', '==', className)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log(`No class found with name: "${className}"`);
      return null;
    }
    
    console.log(`Found class document with ID: ${querySnapshot.docs[0].id}`);
    return {
      id: querySnapshot.docs[0].id,
      ...querySnapshot.docs[0].data()
    };
  } catch (error) {
    console.error('Error getting class:', error);
    return null;
  }
};

// For backward compatibility
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
      // Try looking up by className as well
      return await getClassByName(code);
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

// Get a class for a professor
export const getClassForProfessor = async (professorId: string): Promise<string | null> => {
  if (!professorId) {
    console.error("No professor ID provided to getClassForProfessor");
    return null;
  }

  try {
    console.log(`Looking up class for professor: ${professorId}`);
    const q = query(
      collection(db, CLASS_CODES_COLLECTION),
      where('professorId', '==', professorId)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log(`No class found for professor: ${professorId}`);
      return null;
    }
    
    // Return className if available, otherwise fall back to code
    const className = querySnapshot.docs[0].data().className || querySnapshot.docs[0].data().code;
    console.log(`Found class for professor: "${className}"`);
    return className;
  } catch (error) {
    console.error('Error getting class for professor:', error);
    return null;
  }
};

// For backward compatibility
export const getClassCodeForProfessor = getClassForProfessor;

// Join a class
export const joinClass = async (className: string, studentId: string): Promise<boolean> => {
  if (!className || !studentId) {
    console.error("Missing parameters for joinClass");
    return false;
  }

  try {
    console.log(`Student ${studentId} attempting to join class: "${className}"`);
    
    // Check if the class exists
    const classDoc = await getClassByName(className) || await getClassCodeDoc(className);
    if (!classDoc) {
      console.warn(`Invalid class name: "${className}"`);
      return false;
    }
    
    // Add to joined classes
    const docRef = await addDoc(collection(db, JOINED_CLASSES_COLLECTION), {
      classCode: classDoc.code || className, // For backward compatibility
      className: className,
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
    
    // Return className if available, otherwise fall back to classCode
    const className = querySnapshot.docs[0].data().className || querySnapshot.docs[0].data().classCode;
    console.log(`Found joined class for student: "${className}"`);
    return className;
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

// Validate a class name
export const validateClass = async (className: string): Promise<boolean> => {
  if (!className) {
    console.error("No class name provided to validateClass");
    return false;
  }

  try {
    console.log(`Validating class name: "${className}"`);
    const classDoc = await getClassByName(className) || await getClassCodeDoc(className);
    const isValid = classDoc !== null;
    console.log(`Class name "${className}" is ${isValid ? 'valid' : 'invalid'}`);
    return isValid;
  } catch (error) {
    console.error('Error validating class name:', error);
    return false;
  }
};

// For backward compatibility
export const validateClassCode = validateClass;
export const generateClassCode = (name: string): string => name; 