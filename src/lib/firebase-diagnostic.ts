/**
 * Firebase Diagnostic Tools
 * 
 * This module provides utility functions to diagnose Firebase configuration
 * and connectivity issues. It helps identify and troubleshoot problems with
 * Firebase services.
 */

import { getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where, 
  limit 
} from 'firebase/firestore';
import { db } from './firebase';

export interface DiagnosticResult {
  success: boolean;
  stage: string;
  message: string;
  error?: any;
  data?: any;
}

/**
 * Run all Firebase diagnostics
 * 
 * @returns A promise that resolves to an array of diagnostic results
 */
export const runFirebaseDiagnostics = async (): Promise<DiagnosticResult[]> => {
  console.log("Starting Firebase diagnostics...");
  const results: DiagnosticResult[] = [];
  
  try {
    // Check if Firebase app is initialized
    const appCheckResult = await checkFirebaseApp();
    results.push(appCheckResult);
    
    // Only continue if app check passed
    if (appCheckResult.success) {
      // Check if Firestore can be accessed
      results.push(await checkFirestoreAccess());
      
      // Check if questions collection exists
      results.push(await checkQuestionsCollection());
      
      // Check if a specific session can be accessed
      // Only try this if we have a session code
      if (typeof window !== 'undefined') {
        const sessionCode = localStorage.getItem('lastSessionCode');
        if (sessionCode) {
          results.push(await checkSessionAccess(sessionCode));
        }
      }
    }
    
    console.log("Firebase diagnostics complete:", results);
    return results;
  } catch (error) {
    console.error("Error running Firebase diagnostics:", error);
    results.push({
      success: false,
      stage: 'global',
      message: 'Unhandled error during diagnostics',
      error
    });
    return results;
  }
};

/**
 * Check if Firebase app is properly initialized
 */
const checkFirebaseApp = async (): Promise<DiagnosticResult> => {
  try {
    console.log("Checking Firebase app initialization...");
    
    const app = getApp();
    const config = app.options;
    
    if (!config.projectId) {
      return {
        success: false,
        stage: 'app-init',
        message: 'Firebase app is missing projectId'
      };
    }
    
    return {
      success: true,
      stage: 'app-init',
      message: 'Firebase app is properly initialized',
      data: {
        projectId: config.projectId,
        hasAppId: !!config.appId,
        hasApiKey: !!config.apiKey,
        hasStorageBucket: !!config.storageBucket
      }
    };
  } catch (error) {
    console.error("Firebase app check failed:", error);
    return {
      success: false,
      stage: 'app-init',
      message: 'Failed to get Firebase app',
      error
    };
  }
};

/**
 * Check if Firestore can be accessed
 */
const checkFirestoreAccess = async (): Promise<DiagnosticResult> => {
  try {
    console.log("Checking Firestore access...");
    
    if (!db) {
      return {
        success: false,
        stage: 'firestore-access',
        message: 'Firestore db instance is not initialized'
      };
    }
    
    // Try to access a test collection
    const testQuery = query(collection(db, 'test_collection'), limit(1));
    const snapshot = await getDocs(testQuery);
    
    return {
      success: true,
      stage: 'firestore-access',
      message: 'Successfully accessed Firestore',
      data: {
        docsReturned: snapshot.size
      }
    };
  } catch (error) {
    console.error("Firestore access check failed:", error);
    return {
      success: false,
      stage: 'firestore-access',
      message: 'Failed to access Firestore',
      error
    };
  }
};

/**
 * Check if the questions collection exists and can be queried
 */
const checkQuestionsCollection = async (): Promise<DiagnosticResult> => {
  try {
    console.log("Checking questions collection...");
    
    const q = query(collection(db, 'questions'), limit(5));
    const snapshot = await getDocs(q);
    
    return {
      success: true,
      stage: 'questions-collection',
      message: 'Successfully accessed questions collection',
      data: {
        docsCount: snapshot.size,
        firstDocId: snapshot.docs[0]?.id || 'no documents'
      }
    };
  } catch (error) {
    console.error("Questions collection check failed:", error);
    return {
      success: false,
      stage: 'questions-collection',
      message: 'Failed to access questions collection',
      error
    };
  }
};

/**
 * Check if a specific session can be accessed
 */
const checkSessionAccess = async (sessionCode: string): Promise<DiagnosticResult> => {
  try {
    console.log(`Checking session access for code: ${sessionCode}...`);
    
    if (!sessionCode) {
      return {
        success: false,
        stage: 'session-access',
        message: 'No session code provided'
      };
    }
    
    // Try to find the session in the sessions collection
    const q = query(
      collection(db, 'sessions'),
      where('code', '==', sessionCode),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return {
        success: false,
        stage: 'session-access',
        message: `No session found with code: ${sessionCode}`,
        data: { sessionCode }
      };
    }
    
    return {
      success: true,
      stage: 'session-access',
      message: 'Successfully accessed session data',
      data: {
        sessionCode,
        sessionId: snapshot.docs[0].id,
        sessionData: snapshot.docs[0].data()
      }
    };
  } catch (error) {
    console.error(`Session access check failed for code ${sessionCode}:`, error);
    return {
      success: false,
      stage: 'session-access',
      message: 'Failed to access session data',
      error,
      data: { sessionCode }
    };
  }
};

/**
 * Runs a quick check of the Firebase connection and returns a simple pass/fail result
 */
export const quickFirebaseCheck = async (): Promise<boolean> => {
  try {
    // Try a very basic query
    const testQuery = query(collection(db, 'questions'), limit(1));
    await getDocs(testQuery);
    return true;
  } catch (error) {
    console.error("Quick Firebase check failed:", error);
    return false;
  }
};

export default {
  runFirebaseDiagnostics,
  quickFirebaseCheck
}; 