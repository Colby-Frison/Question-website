/**
 * Question Management QA Test
 * 
 * This file provides test functions to verify the functionality
 * of the question management system. It can be used to quickly
 * diagnose issues with question loading and submission.
 */

import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDoc,
  doc
} from 'firebase/firestore';
import { Question } from '@/types';
import { 
  addQuestion, 
  listenForQuestions, 
  listenForUserQuestions,
  updateQuestion,
  deleteQuestion
} from './questions';

const QUESTIONS_COLLECTION = 'questions';
const USER_QUESTIONS_COLLECTION = 'userQuestions';

/**
 * Tests the Firebase connection and queries the questions collection
 * to verify it's accessible.
 * 
 * @returns {Promise<boolean>} Whether the test passed
 */
export const testQuestionsCollection = async (): Promise<boolean> => {
  try {
    console.log("[QA-Test] Testing questions collection access...");
    
    // Try a simple query on the questions collection
    const q = query(
      collection(db, QUESTIONS_COLLECTION),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    console.log(`[QA-Test] Successfully queried questions collection. Found ${snapshot.docs.length} documents.`);
    
    // Log the first question document for inspection
    if (snapshot.docs.length > 0) {
      const firstDoc = snapshot.docs[0];
      console.log("[QA-Test] Sample question document:", {
        id: firstDoc.id,
        ...firstDoc.data()
      });
    }
    
    return true;
  } catch (error) {
    console.error("[QA-Test] Error testing questions collection:", error);
    return false;
  }
};

/**
 * Tests adding a question to verify write operations work
 * 
 * @param {string} studentId - ID of the test student
 * @param {string} sessionCode - Code of the test session
 * @returns {Promise<Question | null>} The created question or null if creation failed
 */
export const testAddQuestion = async (
  studentId: string,
  sessionCode: string
): Promise<Question | null> => {
  try {
    console.log("[QA-Test] Testing question creation...");
    
    // Create a test question
    const testText = `Test question ${Date.now()}`;
    const question = await addQuestion(testText, studentId, sessionCode);
    
    if (question) {
      console.log("[QA-Test] Successfully created test question:", question);
      return question;
    } else {
      console.error("[QA-Test] Failed to create test question");
      return null;
    }
  } catch (error) {
    console.error("[QA-Test] Error testing question creation:", error);
    return null;
  }
};

/**
 * Tests the question listening functionality
 * 
 * @param {string} sessionCode - Code of the test session
 * @returns {Promise<boolean>} Whether the test passed
 */
export const testListenForQuestions = async (
  sessionCode: string
): Promise<boolean> => {
  return new Promise((resolve) => {
    console.log("[QA-Test] Testing listenForQuestions...");
    
    let received = false;
    let timeout: NodeJS.Timeout;
    
    // Set up a timeout for the test
    timeout = setTimeout(() => {
      if (!received) {
        console.error("[QA-Test] Timed out waiting for questions");
        resolve(false);
      }
    }, 5000);
    
    // Set up the listener
    const unsubscribe = listenForQuestions(
      sessionCode,
      (questions) => {
        console.log(`[QA-Test] Received ${questions.length} questions from listener`);
        received = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve(true);
      }
    );
  });
};

/**
 * Tests the user questions listening functionality
 * 
 * @param {string} studentId - ID of the test student
 * @param {string} sessionCode - Code of the test session
 * @returns {Promise<boolean>} Whether the test passed
 */
export const testListenForUserQuestions = async (
  studentId: string,
  sessionCode: string
): Promise<boolean> => {
  return new Promise((resolve) => {
    console.log("[QA-Test] Testing listenForUserQuestions...");
    
    let received = false;
    let timeout: NodeJS.Timeout;
    
    // Set up a timeout for the test
    timeout = setTimeout(() => {
      if (!received) {
        console.error("[QA-Test] Timed out waiting for user questions");
        resolve(false);
      }
    }, 5000);
    
    // Set up the listener
    const unsubscribe = listenForUserQuestions(
      studentId,
      sessionCode,
      (questions) => {
        console.log(`[QA-Test] Received ${questions.length} user questions from listener`);
        received = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve(true);
      }
    );
  });
};

/**
 * Run a complete test of the question management system
 * 
 * @param {string} studentId - ID of the test student
 * @param {string} sessionCode - Code of the test session
 * @returns {Promise<boolean>} Whether all tests passed
 */
export const runQuestionSystemTest = async (
  studentId: string,
  sessionCode: string
): Promise<boolean> => {
  try {
    console.log("[QA-Test] Starting complete question system test...");
    console.log(`[QA-Test] Using student ID: ${studentId}`);
    console.log(`[QA-Test] Using session code: ${sessionCode}`);
    
    // Step 1: Test questions collection access
    const collectionTest = await testQuestionsCollection();
    if (!collectionTest) {
      console.error("[QA-Test] Questions collection test failed");
      return false;
    }
    
    // Step 2: Test adding a question
    const question = await testAddQuestion(studentId, sessionCode);
    if (!question) {
      console.error("[QA-Test] Question creation test failed");
      return false;
    }
    
    // Step 3: Test listening for questions
    const listenTest = await testListenForQuestions(sessionCode);
    if (!listenTest) {
      console.error("[QA-Test] Question listening test failed");
      return false;
    }
    
    // Step 4: Test listening for user questions
    const userQuestionTest = await testListenForUserQuestions(studentId, sessionCode);
    if (!userQuestionTest) {
      console.error("[QA-Test] User question listening test failed");
      return false;
    }
    
    console.log("[QA-Test] All tests completed successfully!");
    return true;
  } catch (error) {
    console.error("[QA-Test] Error running question system test:", error);
    return false;
  }
};

export default {
  testQuestionsCollection,
  testAddQuestion,
  testListenForQuestions,
  testListenForUserQuestions,
  runQuestionSystemTest
}; 