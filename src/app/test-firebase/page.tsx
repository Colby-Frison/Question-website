'use client';

import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

export default function TestFirebasePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>({});
  const [detailedError, setDetailedError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        // Log environment variables (masked for security)
        const envVars = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✓ Present' : '✗ Missing',
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✓ Present' : '✗ Missing',
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✓ Present' : '✗ Missing',
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✓ Present' : '✗ Missing',
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✓ Present' : '✗ Missing',
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✓ Present' : '✗ Missing',
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? '✓ Present' : '✗ Missing',
        };
        
        setConfig(envVars);
        console.log('Environment variables status:', envVars);

        // Show actual values for debugging (except API key)
        console.log('Actual values (for debugging):');
        console.log('- projectId:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
        console.log('- authDomain:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
        console.log('- storageBucket:', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

        // Firebase config - using the exact format from Firebase
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
        console.log('Initializing Firebase...');
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        console.log('Firebase initialized');

        // Initialize Analytics if in browser
        if (typeof window !== 'undefined') {
          try {
            const analytics = getAnalytics(app);
            console.log('Analytics initialized');
          } catch (analyticsError) {
            console.warn('Analytics initialization failed:', analyticsError);
          }
        }

        // Test query
        console.log('Testing Firestore query...');
        const testQuery = query(collection(db, 'questions'), limit(1));
        const querySnapshot = await getDocs(testQuery);
        console.log(`Query successful! Found ${querySnapshot.docs.length} documents`);

        setStatus('success');
      } catch (err: any) {
        console.error('Firebase connection error:', err);
        setStatus('error');
        setError(err.message || 'Unknown error');
        
        // Provide more detailed error information
        let detailedErrorInfo = '';
        
        if (err.code === 'permission-denied') {
          detailedErrorInfo = 'Firestore security rules are preventing access. Check your security rules in the Firebase console.';
        } else if (err.code === 'unavailable') {
          detailedErrorInfo = 'Firebase service is unavailable. Check your internet connection or Firebase status.';
        } else if (err.code === 'invalid-argument') {
          detailedErrorInfo = 'Invalid configuration. Check that your project ID and other settings are correct.';
        } else if (err.code === 'app/no-app') {
          detailedErrorInfo = 'No Firebase app has been created. Check your initialization code.';
        } else if (err.message?.includes('API key')) {
          detailedErrorInfo = 'Invalid API key. Check that your API key is correct in the environment variables.';
        }
        
        setDetailedError(detailedErrorInfo || null);
      }
    }

    testConnection();
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Firebase Connection Test</h1>
      
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Environment Variables Status:</h2>
        <pre className="bg-gray-800 text-white p-4 rounded overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <span className="ml-2">Testing Firebase connection...</span>
        </div>
      )}

      {status === 'success' && (
        <div className="bg-green-100 text-green-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold">✅ Connection Successful!</h2>
          <p className="mt-2">Your Firebase configuration is working correctly.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-100 text-red-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold">❌ Connection Failed</h2>
          <p className="mt-2">Error: {error}</p>
          
          {detailedError && (
            <div className="mt-2 p-2 bg-red-50 rounded">
              <p><strong>Diagnosis:</strong> {detailedError}</p>
            </div>
          )}
          
          <div className="mt-4">
            <h3 className="font-medium">Troubleshooting Steps:</h3>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Check that all environment variables are correctly set in Vercel</li>
              <li>Verify your Firebase project is active</li>
              <li>Ensure Firestore is enabled in your Firebase project</li>
              <li>Check your Firestore security rules</li>
              <li>Verify your internet connection</li>
              <li>Check browser console for more detailed error messages</li>
            </ol>
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm text-gray-600">
          Open your browser console (F12) to see detailed logs.
        </p>
      </div>
    </div>
  );
} 