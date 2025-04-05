import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore, connectFirestoreEmulator, collection, query, getDocs, limit } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;
let analytics: any;

try {
  console.log("Initializing Firebase...");
  
  // Check if Firebase is already initialized
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
  } else {
    app = getApps()[0];
    console.log("Using existing Firebase app");
  }
  
  db = getFirestore(app);
  
  // Initialize analytics if we're in the browser
  if (typeof window !== 'undefined') {
    try {
      analytics = getAnalytics(app);
      console.log("Firebase analytics initialized");
    } catch (analyticsError) {
      console.warn("Analytics initialization failed:", analyticsError);
    }
  }
  
  // Uncomment the following line to use Firebase emulator during development
  // if (process.env.NODE_ENV === 'development') {
  //   connectFirestoreEmulator(db, 'localhost', 8080);
  //   console.log("Connected to Firestore emulator");
  // }
} catch (error) {
  console.error("Error initializing Firebase:", error);
  // Fallback to prevent app from crashing
  console.warn("Using fallback Firebase configuration");
  if (getApps().length === 0) {
    app = initializeApp({
      apiKey: "dummy-key",
      projectId: "demo-fallback",
      appId: "demo"
    }, 'fallback-instance');
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
}

/**
 * Check if Firebase is properly configured and can connect to the database
 * 
 * @returns Promise<boolean> - Whether Firebase connection was successful
 */
export const checkFirebaseConnection = async (): Promise<boolean> => {
  try {
    console.log("[Firebase] Checking connection status...");
    
    // Check if Firebase is initialized
    if (!db) {
      console.error("[Firebase] Firebase DB not initialized");
      return false;
    }
    
    // Print out Firebase config (except sensitive parts) for debugging
    console.log("[Firebase] Firebase configuration check:");
    const config = getApp().options;
    console.log({
      projectId: config.projectId,
      appId: config.appId ? "exists" : "missing",
      databaseURL: config.databaseURL ? "exists" : "missing",
      storageBucket: config.storageBucket ? "exists" : "missing"
    });
    
    // Try to access a test collection to verify connection works
    const testCollection = collection(db, 'test_connection');
    const testQuery = query(testCollection, limit(1));
    
    console.log("[Firebase] Attempting to query test collection...");
    await getDocs(testQuery);
    
    console.log("[Firebase] Connection successful - database is accessible");
    return true;
  } catch (error) {
    console.error("[Firebase] Connection check failed:", error);
    return false;
  }
};

export { db }; 