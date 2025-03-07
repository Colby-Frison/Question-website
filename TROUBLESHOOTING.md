# Troubleshooting Firebase Issues

This guide will help you resolve common issues with the Firebase integration in the Classroom Q&A application.

## Common Issues and Solutions

### 1. Class Code Not Generating

**Symptoms:**
- The professor dashboard shows "No code generated yet"
- The class code doesn't appear after logging in as a professor

**Possible Causes and Solutions:**

#### a) Firebase Configuration Issues
- **Problem:** Incorrect Firebase configuration in `src/lib/firebase.ts`
- **Solution:** Replace the dummy configuration with your actual Firebase configuration:
  ```javascript
  const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  ```

#### b) Firestore Database Not Created
- **Problem:** You haven't created a Firestore database in your Firebase project
- **Solution:** 
  1. Go to the [Firebase Console](https://console.firebase.google.com/)
  2. Select your project
  3. Click on "Firestore Database" in the left sidebar
  4. Click "Create database"
  5. Choose either "Start in production mode" or "Start in test mode"
  6. Select a location close to your users

#### c) Firestore Security Rules Too Restrictive
- **Problem:** Your security rules are blocking write operations
- **Solution:** Update your security rules in the Firebase Console:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;  // For testing only!
      }
    }
  }
  ```
  **Note:** This is for testing only. Use proper security rules in production.

### 2. Questions Always Loading

**Symptoms:**
- The questions list shows a loading spinner indefinitely
- No questions appear even after submitting them

**Possible Causes and Solutions:**

#### a) Firebase Connectivity Issues
- **Problem:** The application can't connect to Firebase
- **Solution:** Run the test script to verify connectivity:
  ```bash
  node src/lib/test-firebase.js
  ```
  Follow the troubleshooting steps provided by the script.

#### b) Class Code Mismatch
- **Problem:** The professor and student are using different class codes
- **Solution:** 
  1. Check the console logs to see what class code is being used
  2. Make sure the student is entering the exact same code shown on the professor's dashboard

#### c) Browser Console Errors
- **Problem:** JavaScript errors are preventing the application from working
- **Solution:**
  1. Open your browser's developer tools (F12 or right-click > Inspect)
  2. Go to the Console tab
  3. Look for any error messages related to Firebase
  4. Fix the specific errors shown

### 3. Firebase API Key Issues

**Symptoms:**
- Console errors mentioning "API key not valid"
- "Firebase: Error (auth/invalid-api-key)" messages

**Solutions:**
1. Make sure you're using the correct API key from your Firebase project
2. Check if your API key has any restrictions in the Google Cloud Console
3. If using a new Firebase project, it might take a few minutes for the API key to become active

### 4. CORS Issues

**Symptoms:**
- Console errors mentioning "Cross-Origin Request Blocked"
- Firebase operations fail with network errors

**Solutions:**
1. Make sure your Firebase project has the correct domain added to the authorized domains list:
   - Go to Firebase Console > Authentication > Sign-in method > Authorized domains
   - Add your deployment domain (e.g., `your-app.vercel.app`)
2. For local development, add `localhost` to the authorized domains

## Testing Firebase Connectivity

To verify your Firebase connection is working correctly:

1. Run the test script:
   ```bash
   node src/lib/test-firebase.js
   ```

2. Check the browser console for detailed logs:
   - Open your application in the browser
   - Open developer tools (F12)
   - Go to the Console tab
   - Look for logs starting with "Firebase:" or "Firestore:"

## Fixing Firebase Configuration

If you need to update your Firebase configuration:

1. Go to your [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on the gear icon (⚙️) next to "Project Overview"
4. Select "Project settings"
5. Scroll down to "Your apps" section
6. Select your web app or create a new one
7. Copy the configuration object
8. Replace the configuration in `src/lib/firebase.ts`

## Firestore Security Rules

For a production application, use these security rules as a starting point:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Questions collection
    match /questions/{questionId} {
      allow read: if true;
      allow create: if request.resource.data.text != null 
                    && request.resource.data.classCode != null;
      allow delete: if true;
    }
    
    // User questions collection
    match /userQuestions/{userQuestionId} {
      allow read, write: if true;
    }
    
    // Class codes collection
    match /classCodes/{codeId} {
      allow read: if true;
      allow create: if request.resource.data.code != null;
    }
    
    // Joined classes collection
    match /joinedClasses/{joinId} {
      allow read, write: if true;
    }
  }
}
```

## Still Having Issues?

If you're still experiencing problems after trying these solutions:

1. Check the Firebase status page: https://status.firebase.google.com/
2. Clear your browser cache and cookies
3. Try using a different browser
4. Verify your internet connection is stable
5. Check if your Firebase project has reached any usage limits 