# Troubleshooting Guide for Classroom Q&A

This guide will help you resolve common issues with the Classroom Q&A application.

## Table of Contents

- [Firebase Issues](#firebase-issues)
- [Theme and UI Issues](#theme-and-ui-issues)
- [Component Issues](#component-issues)
- [Deployment Issues](#deployment-issues)
- [Class Management Issues](#class-management-issues)
- [Question Management Issues](#question-management-issues)
- [Performance Issues](#performance-issues)

## Firebase Issues

### Class Name Creation Issues

**Symptoms:**
- Error when creating a class name
- Class name doesn't appear after creation
- "This class name already exists" error appears incorrectly

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
- **Solution:** Update your security rules in the Firebase Console to include the new fields:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /classCodes/{codeId} {
        allow read: if true;
        allow create: if request.resource.data.code != null || 
                      request.resource.data.className != null;
      }
      // Other collection rules...
    }
  }
  ```

#### d) Duplicate Class Name Check
- **Problem:** The class name already exists in the database
- **Solution:** 
  1. Try a different, more unique class name
  2. Check the Firebase console to see existing class names
  3. If testing, you can delete existing class names from the Firebase Console

### Class Session Management Issues

**Symptoms:**
- Error when archiving or closing a class session
- Session status doesn't change after archiving
- Error in console related to `archiveClassSession` or `closeClassSession`

**Solutions:**
1. Verify the `sessionId` is being passed correctly to the functions
2. Check the console for specific error messages
3. Ensure your Firestore security rules allow updating sessions:
   ```
   // Class sessions collection
   match /classSessions/{sessionId} {
     allow read: if true;
     allow create: if request.resource.data.code != null && 
                   request.resource.data.professorId != null;
     allow update: if request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(['status', 'lastActiveAt', 'lastActive', 'archivedAt']);
     allow delete: if true;
   }
   ```
4. Manually verify the session exists in Firestore using the Firebase Console

### Question Loading Issues

**Symptoms:**
- Questions are stuck in loading state
- No questions appear even after submitting them
- Console errors related to Firestore queries

**Possible Causes and Solutions:**

#### a) Firebase Connectivity Issues
- **Problem:** The application can't connect to Firebase
- **Solution:** Check for network issues and verify Firebase status:
  1. Check your internet connection
  2. Visit [Firebase Status](https://status.firebase.google.com/)
  3. Look for console errors related to Firebase connection

#### b) Class Name Mismatch
- **Problem:** The professor and student are using different class names
- **Solution:** 
  1. Check the console logs to see what class name is being used
  2. Make sure the student is entering the exact same name shown on the professor's dashboard
  3. Remember that class names are case-sensitive

#### c) Missing Firestore Index
- **Problem:** The required Firestore index hasn't been created
- **Solution:**
  1. Check the console for an error like "FAILED_PRECONDITION: The query requires an index"
  2. Click on the provided link in the error message to create the index, or
  3. Manually create an index in the Firebase Console:
     - Collection: `questions`
     - Fields: `classCode` (Ascending), `timestamp` (Descending)

## Theme and UI Issues

### Theme Toggle Not Working

**Symptoms:**
- Clicking the theme toggle doesn't change the theme
- Theme resets after page refresh
- UI elements don't update with theme changes

**Solutions:**
1. Check that the `ThemeProvider` is correctly wrapping your application in `layout.tsx`
2. Verify that the theme is being stored in localStorage:
   ```javascript
   // In browser console
   localStorage.getItem('theme')
   ```
3. Ensure the `theme` attribute is being applied to the HTML or body element
4. Check if other extensions or browser settings are overriding your theme

### Dark Mode Styling Issues

**Symptoms:**
- Some elements don't change color in dark mode
- Text becomes unreadable in dark mode
- Dark mode colors look inconsistent

**Solutions:**
1. Check that all components use the theme class variables
2. Ensure all colors use the `dark:` variant in Tailwind classes
3. Verify that the `next-themes` package is correctly integrated
4. Check for hardcoded color values that don't respect the theme

## Component Issues

### Component Rendering Problems

**Symptoms:**
- Components not rendering correctly
- "Hydration mismatch" errors in console
- Components showing incorrect or blank state

**Solutions:**

#### a) Hydration Issues
- **Problem:** Server and client side rendering don't match
- **Solution:**
  ```javascript
  // Use the useEffect and mounted approach
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return null; // or a skeleton/placeholder
  }
  ```

#### b) Missing Props
- **Problem:** Required props aren't being passed to components
- **Solution:**
  1. Check all required props in the component TypeScript interfaces
  2. Add default values where appropriate:
     ```typescript
     function Component({ prop = 'default' }: Props) {
       // ...
     }
     ```
  3. Use optional chaining when accessing potentially undefined props:
     ```javascript
     {props.items?.map(item => (
       <div key={item.id}>{item.name}</div>
     ))}
     ```

#### c) State Management Issues
- **Problem:** Component state isn't updating as expected
- **Solution:**
  1. Use the React DevTools to inspect component state
  2. Verify that state update functions are being called
  3. Check for dependency arrays in `useEffect` hooks
  4. Consider using `useCallback` for functions passed to child components

## Deployment Issues

### Next.js Build Errors

**Symptoms:**
- Build fails during deployment
- TypeScript errors during build
- Module resolution errors

**Solutions:**
1. Run the build locally to debug: `npm run build`
2. Check TypeScript errors and fix them
3. Ensure all dependencies are properly installed
4. Check for environment variables that might be missing in your deployment platform

### Firebase Integration Issues in Production

**Symptoms:**
- App works locally but not in production
- Firebase-related errors in production logs
- Authentication problems in the deployed version

**Solutions:**
1. Verify all Firebase environment variables are correctly set in your hosting platform
2. Add your deployment domain to Firebase authorized domains:
   - Go to Firebase Console > Authentication > Sign-in method > Authorized domains
3. Check for CORS issues in the browser console
4. Ensure Firebase security rules allow access from your production domain

## Class Management Issues

### Student Can't Join Class

**Symptoms:**
- "Invalid class name" error when student tries to join
- Joining process seems to succeed but student can't see questions
- No error but joining doesn't work

**Solutions:**
1. Verify the exact class name (case-sensitive) is being entered
2. Check if the class exists in the Firebase Console
3. Ensure the studentId is being generated and stored correctly
4. Verify the `joinClass` function is working:
   ```javascript
   // In the browser console
   joinClass('ExactClassName', 'test-student-id').then(console.log)
   ```

### Professor Can't See Student Questions

**Symptoms:**
- Questions are submitted but don't appear for the professor
- Only some questions appear for the professor
- Delay in questions appearing

**Solutions:**
1. Check if real-time listeners are correctly set up
2. Verify that questions are being saved with the correct class name
3. Look for console errors related to permission issues
4. Check if the question status filter is excluding some questions

## Question Management Issues

### Question Status Toggle Not Working

**Symptoms:**
- Toggling question status doesn't update the UI
- Status updates but reverts after refresh
- Error in console when toggling status

**Solutions:**
1. Check if the `updateQuestionStatus` function is being called correctly
2. Verify Firestore security rules allow updating the status field:
   ```
   allow update: if request.resource.data.diff(resource.data).affectedKeys()
                .hasOnly(['status']);
   ```
3. Ensure the question document exists in Firestore
4. Check if the UI is correctly reflecting the updated status

### Question Editing Issues

**Symptoms:**
- Can't edit questions as a student
- Edits don't save correctly
- Error when trying to save edits

**Solutions:**
1. Verify the student's ID matches the question creator
2. Check if the `updateQuestion` function is being called with correct parameters
3. Ensure Firestore security rules allow updating the text field:
   ```
   allow update: if request.resource.data.diff(resource.data).affectedKeys()
                .hasOnly(['text']);
   ```
4. Look for client-side validation errors (e.g., character limit)

## Performance Issues

### Slow Loading Times

**Symptoms:**
- Application takes a long time to load
- Question lists load slowly
- UI freezes when performing actions

**Solutions:**
1. Implement pagination for question lists
2. Use `useMemo` and `useCallback` for computationally expensive operations
3. Optimize Firebase queries with proper indexes
4. Consider implementing caching for frequently accessed data

### Memory Usage Issues

**Symptoms:**
- Browser becomes laggy after extended use
- Memory usage increases over time
- Console warnings about memory leaks

**Solutions:**
1. Clean up Firebase listeners in `useEffect` cleanup functions:
   ```javascript
   useEffect(() => {
     const unsubscribe = onSnapshot(...);
     return () => unsubscribe();
   }, []);
   ```
2. Avoid creating new objects or functions in render cycles
3. Use React DevTools profiler to identify performance bottlenecks
4. Consider code-splitting for large component trees

## Still Having Issues?

If you're still experiencing problems after trying these solutions:

1. Check the Firebase status page: https://status.firebase.google.com/
2. Clear your browser cache and cookies
3. Try using a different browser
4. Verify your internet connection is stable
5. Check if your Firebase project has reached any usage limits 
6. Look for detailed error messages in the browser console

For development issues, consider using the React DevTools and Firebase Emulator Suite for local debugging. 