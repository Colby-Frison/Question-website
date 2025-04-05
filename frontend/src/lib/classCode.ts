/**
 * Class Code Management Module
 * 
 * This module handles functionality related to class codes, which are used to:
 * - Allow professors to create and manage classes
 * - Enable students to join specific classes
 * - Track which students have joined which classes
 * 
 * The module provides functions for generating, validating, and managing class codes,
 * as well as tracking class enrollment.
 */

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
  setDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { getSessionByCode } from './classSession';

// Collection reference - keeping the same collection names for backward compatibility
const CLASS_CODES_COLLECTION = 'classCodes';
const JOINED_CLASSES_COLLECTION = 'joinedClasses';
const STUDENT_COUNTS_COLLECTION = 'studentCounts';

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

/**
 * Generate a unique class code
 * 
 * Creates a random 6-character alphanumeric code to use as a class identifier.
 * This code is what students will use to join a professor's class.
 * 
 * @returns A randomly generated 6-character class code
 */
export const generateClassCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  
  return result;
};

/**
 * Create a new class code for a professor
 * 
 * Generates and stores a new class code associated with a specific professor.
 * If the professor already has a class code, it returns the existing one.
 * 
 * @param professorId - The ID of the professor creating the class
 * @returns A promise that resolves to the class code (either new or existing)
 */
export const createClassCode = async (professorId: string): Promise<string> => {
  if (!professorId) {
    console.error("No professor ID provided to createClassCode");
    throw new Error("Professor ID is required");
  }

  try {
    // Check if the professor already has a class code
    const existingCode = await getClassForProfessor(professorId);
    
    if (existingCode) {
      console.log(`Professor ${professorId} already has class code: ${existingCode}`);
      return existingCode;
    }
    
    // Generate a new class code
    const newCode = generateClassCode();
    console.log(`Generated new class code for professor ${professorId}: ${newCode}`);
    
    // Store the class code in Firestore
    await addDoc(collection(db, CLASS_CODES_COLLECTION), {
      professorId,
      code: newCode,
      createdAt: Date.now()
    });
    
    console.log(`Class code ${newCode} stored in database`);
    return newCode;
  } catch (error) {
    console.error("Error creating class code:", error);
    throw error;
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

/**
 * Get the class code for a specific professor
 * 
 * Retrieves the class code associated with a professor, if one exists.
 * 
 * @param professorId - The ID of the professor to get the class code for
 * @returns A promise that resolves to the class code or null if none exists
 */
export const getClassForProfessor = async (professorId: string): Promise<string | null> => {
  if (!professorId) {
    console.warn("No professor ID provided to getClassForProfessor");
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
      console.log(`No class code found for professor ${professorId}`);
      return null;
    }
    
    // Just return the first one if multiple exist
    const doc = querySnapshot.docs[0];
    const code = doc.data().code;
    console.log(`Found class code for professor ${professorId}: ${code}`);
    
    return code;
  } catch (error) {
    console.error("Error getting class for professor:", error);
    return null;
  }
};

// For backward compatibility
export const getClassCodeForProfessor = getClassForProfessor;

/**
 * Join a class as a student
 * 
 * Records that a student has joined a specific class by its session code.
 * This allows tracking which students are in which classes.
 * 
 * @param sessionCode - The session code of the class session to join
 * @param studentId - The ID of the student joining the class
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const joinClass = async (sessionCode: string, studentId: string): Promise<boolean> => {
  if (!sessionCode || !studentId) {
    console.error("Missing parameters for joinClass: ", { sessionCode, studentId });
    return false;
  }

  try {
    console.log(`Student ${studentId} attempting to join class with session code: ${sessionCode}`);
    
    // Check if the session code is valid by looking it up directly
    const sessionResult = await getSessionByCode(sessionCode);
    
    if (!sessionResult) {
      console.log(`Invalid session code: ${sessionCode} - No active session found`);
      return false;
    }
    
    console.log(`Found valid session: ${sessionResult.id} for class: ${sessionResult.code}`);
    
    // Check if student has already joined this class
    const joinedQuery = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const joinedSnapshot = await getDocs(joinedQuery);
    console.log(`Found ${joinedSnapshot.docs.length} existing join records for student`);
    
    // If student has already joined a class, update it
    if (!joinedSnapshot.empty) {
      const doc = joinedSnapshot.docs[0];
      const updateData = {
        sessionCode,             // The session code for joining
        className: sessionResult.code, // The original class name
        joinedAt: Date.now()
      };
      console.log("Updating existing join record:", updateData);
      await updateDoc(doc.ref, updateData);
      console.log(`Updated class for student ${studentId} to session ${sessionCode}`);
    } else {
      // Otherwise, create a new join record
      const newJoinRecord = {
        studentId,
        sessionCode,             // The session code for joining
        className: sessionResult.code, // The original class name
        joinedAt: Date.now()
      };
      console.log("Creating new join record:", newJoinRecord);
      await addDoc(collection(db, JOINED_CLASSES_COLLECTION), newJoinRecord);
      console.log(`Student ${studentId} joined class ${sessionCode}`);
    }
    
    return true;
  } catch (error) {
    console.error("Error joining class:", error);
    return false;
  }
};

/**
 * Get the class that a student has joined
 * 
 * Retrieves the class code a student has joined, if any.
 * Updated to return class and session code information.
 * 
 * @param studentId - The ID of the student to check
 * @returns A promise that resolves to an object with className and sessionCode, or null if not joined
 */
export const getJoinedClass = async (studentId: string): Promise<{ className: string; sessionCode: string } | null> => {
  if (!studentId) {
    console.warn("No student ID provided to getJoinedClass");
    return null;
  }

  try {
    console.log(`Checking if student ${studentId} has joined a class`);
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`Student ${studentId} has not joined any classes`);
      return null;
    }
    
    // Get the most recent joined class
    const sortedDocs = querySnapshot.docs.sort(
      (a, b) => (b.data().joinedAt || 0) - (a.data().joinedAt || 0)
    );
    
    const joinedClass = sortedDocs[0].data();
    
    // Extract the class name and session code (if available)
    const className = joinedClass.className || joinedClass.classCode;
    const sessionCode = joinedClass.sessionCode || joinedClass.classCode;
    
    console.log(`Student ${studentId} has joined class: ${className} with session: ${sessionCode}`);
    
    return { 
      className,
      sessionCode
    };
  } catch (error) {
    console.error("Error getting joined class:", error);
    return null;
  }
};

/**
 * Leave a class as a student
 * 
 * Removes the record of a student having joined a class.
 * 
 * @param studentId - The ID of the student leaving the class
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const leaveClass = async (studentId: string): Promise<boolean> => {
  if (!studentId) {
    console.error("No student ID provided to leaveClass");
    return false;
  }

  try {
    console.log(`Student ${studentId} attempting to leave class`);
    const q = query(
      collection(db, JOINED_CLASSES_COLLECTION),
      where('studentId', '==', studentId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`No joined class found for student ${studentId}`);
      return false;
    }
    
    // Delete all joined class records for this student
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    console.log(`Student ${studentId} left class`);
    
    return true;
  } catch (error) {
    console.error("Error leaving class:", error);
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

/**
 * Create a new class with a given name for a professor
 * 
 * This function:
 * - Validates and formats the class name
 * - Checks if a class with this name already exists
 * - Creates a new class entry in the database
 * 
 * @param className - The name of the class to create
 * @param professorId - The ID of the professor creating the class
 * @returns A promise that resolves to a boolean indicating success/failure
 */
export const createClass = async (className: string, professorId: string): Promise<boolean> => {
  if (!className || !professorId) {
    console.error("Missing parameters for createClass");
    return false;
  }

  try {
    // Check if class name already exists
    const existingClass = await getClassByName(className);
    if (existingClass) {
      console.log(`Class with name "${className}" already exists`);
      return false;
    }
    
    console.log(`Creating new class "${className}" for professor ${professorId}`);
    
    // Create the class entry in Firestore
    await addDoc(collection(db, CLASS_CODES_COLLECTION), {
      professorId,
      className,
      code: generateClassCode(),
      createdAt: Date.now()
    });
    
    console.log(`Class "${className}" created successfully`);
    return true;
  } catch (error) {
    console.error("Error creating class:", error);
    return false;
  }
};

/**
 * Update student count for a session
 * 
 * Updates the count of students in a class session.
 * This is called when students join or leave a class.
 * 
 * @param sessionCode - The session code to update count for
 * @param increment - Whether to increment (true) or decrement (false) the count
 * @returns A promise that resolves to the new count
 */
export const updateStudentCount = async (sessionCode: string, increment: boolean): Promise<number> => {
  if (!sessionCode) {
    console.error("No session code provided to updateStudentCount");
    return 0;
  }

  try {
    const countRef = doc(db, STUDENT_COUNTS_COLLECTION, sessionCode);
    const countDoc = await getDoc(countRef);

    let newCount = 0;
    if (countDoc.exists()) {
      newCount = countDoc.data().count || 0;
    }

    // Update the count
    newCount = increment ? newCount + 1 : Math.max(0, newCount - 1);

    // Save the new count
    await setDoc(countRef, {
      count: newCount,
      lastUpdated: Date.now()
    });

    return newCount;
  } catch (error) {
    console.error("Error updating student count:", error);
    return 0;
  }
};

/**
 * Get student count for a session
 * 
 * Retrieves the current count of students in a class session.
 * 
 * @param sessionCode - The session code to get count for
 * @returns A promise that resolves to the current student count
 */
export const getStudentCount = async (sessionCode: string): Promise<number> => {
  if (!sessionCode) {
    console.error("No session code provided to getStudentCount");
    return 0;
  }

  try {
    const countRef = doc(db, STUDENT_COUNTS_COLLECTION, sessionCode);
    const countDoc = await getDoc(countRef);

    if (countDoc.exists()) {
      return countDoc.data().count || 0;
    }

    return 0;
  } catch (error) {
    console.error("Error getting student count:", error);
    return 0;
  }
};

/**
 * Listen for student count changes
 * 
 * Sets up a real-time listener for changes to the student count in a session.
 * 
 * @param sessionCode - The session code to listen for
 * @param callback - Function to call when count changes
 * @returns A function to unsubscribe from the listener
 */
export const listenForStudentCount = (
  sessionCode: string,
  callback: (count: number) => void
): () => void => {
  if (!sessionCode) {
    console.error("No session code provided to listenForStudentCount");
    callback(0);
    return () => {};
  }

  try {
    const countRef = doc(db, STUDENT_COUNTS_COLLECTION, sessionCode);
    return onSnapshot(countRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data().count || 0);
      } else {
        callback(0);
      }
    }, (error) => {
      console.error(`Error in student count listener for ${sessionCode}:`, error);
      callback(0);
    });
  } catch (error) {
    console.error(`Error setting up student count listener for ${sessionCode}:`, error);
    callback(0);
    return () => {};
  }
}; 