// This is a simple script to test Firebase connectivity
// You can run it with: node src/lib/test-firebase.js

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, limit } = require('firebase/firestore');

// Your web app's Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

async function testFirebaseConnection() {
  console.log("Testing Firebase connection...");
  
  // Check if environment variables are loaded
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    console.error("Firebase configuration not found in environment variables.");
    console.error("Make sure you have a .env.local file with the required variables.");
    return false;
  }
  
  try {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    console.log("Firebase initialized");
    
    // Try to access Firestore
    console.log("Attempting to query Firestore...");
    const testQuery = query(collection(db, 'questions'), limit(1));
    const querySnapshot = await getDocs(testQuery);
    
    console.log(`Connection successful! Found ${querySnapshot.docs.length} documents.`);
    
    // Try to create a test collection
    console.log("\nFirebase connection test passed! ✅");
    console.log("\nNext steps:");
    console.log("1. Make sure your Firebase console has Firestore enabled");
    console.log("2. Verify your Firebase security rules allow read/write operations");
    
    return true;
  } catch (error) {
    console.error("\nFirebase connection test failed! ❌");
    console.error("Error details:", error);
    
    console.log("\nTroubleshooting steps:");
    console.log("1. Check if your Firebase configuration is correct");
    console.log("2. Ensure you've created a Firestore database in your Firebase project");
    console.log("3. Verify your Firebase security rules allow read operations");
    console.log("4. Check your internet connection");
    console.log("5. Make sure your Firebase project is active and not suspended");
    
    return false;
  }
}

// Run the test
testFirebaseConnection(); 