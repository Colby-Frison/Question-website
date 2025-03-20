# Classroom Q&A

A web application for students to anonymously ask questions to their professors without having to raise their hand.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Component Architecture](#component-architecture)
- [Setup and Installation](#setup-and-installation)
- [Deployment](#deployment)
- [Firebase Configuration](#firebase-configuration)
- [Project Structure](#project-structure)
- [Question System Documentation](#question-system-documentation)
- [Future Enhancements](#future-enhancements)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Overview

Classroom Q&A is designed to enhance classroom engagement by allowing students to ask questions anonymously. This reduces the anxiety associated with raising hands in class and ensures that all students have an equal opportunity to have their questions addressed.

## Features

- **Anonymous Questions**: Students can ask questions without revealing their identity to others
- **Professor Interface**: Create class names, view and manage student questions
- **Student Interface**: Join classes using names, submit and edit anonymous questions
- **Question Status Tracking**: Professors can mark questions as answered or unanswered
- **Real-time Updates**: Questions appear in real-time for professors
- **Dark/Light Theme**: Supports system preferences and manual theme toggle
- **Responsive Design**: Works seamlessly across desktop, tablet, and mobile devices
- **Class Session Management**: Professors can archive or close class sessions
- **Clipboard Integration**: Easy sharing of class names with students

## Technology Stack

- **Frontend**: Next.js 14 with React and TypeScript
- **Styling**: Tailwind CSS with custom theme variables
- **Database**: Firebase Firestore for real-time data synchronization
- **State Management**: React Hooks with context for theme management
- **Analytics**: Firebase Analytics
- **Component Architecture**: Well-documented, reusable components with JSDoc documentation

## How It Works

### Role Selection

When users first access the application, they select their role:
- **Professor**: Creates and manages classes, views and responds to questions
- **Student**: Joins classes and submits questions anonymously

### Class Management

1. **Professor Creates Class**: 
   - A professor creates a class with a unique, validated name
   - This name can be shared with students to join the class
   - Professors can archive a class session for later reference or close it completely

2. **Student Joins Class**:
   - Students enter the class name provided by their professor
   - Once joined, they can start asking questions
   - Students can see the status of their questions (answered/unanswered)

### Question Flow

1. **Student Submits Question**:
   - Student types and submits a question with character limit validation
   - Students can edit or delete their own questions
   - Question is stored in Firebase with the class name but without student identifiers
   - A separate record links the question to the student (for their reference only)

2. **Professor Views Questions**:
   - All questions for the class appear in real-time on the professor's dashboard
   - Questions are ordered by timestamp (newest first)
   - Professor can toggle questions between answered and unanswered states
   - Professor can delete questions as needed

3. **Real-time Updates**:
   - Firebase Firestore provides real-time synchronization
   - New questions appear immediately without refreshing the page
   - Status changes are reflected in real-time for both professors and students

### Theme Support

The application supports both light and dark themes:

1. **System Preference**: Automatically detects and applies the user's system preference
2. **Manual Toggle**: Users can override system preference with a manual toggle
3. **Persistent Selection**: User's theme choice is saved between sessions
4. **Smooth Transitions**: Theme changes include smooth CSS transitions

### Data Structure

The application uses four main Firestore collections:

1. **questions**: Stores all questions with class codes, status (answered/unanswered), and timestamps
2. **userQuestions**: Links questions to specific users (for their own reference)
3. **classCodes**: Stores class names created by professors
4. **classSessions**: Manages active, archived, and closed class sessions
5. **joinedClasses**: Tracks which students have joined which classes

### Anonymity Preservation

Student anonymity is preserved through several mechanisms:

1. **No Personal Information**: Questions are stored without any identifying information
2. **Separate Collections**: Questions are stored in a global collection without user IDs
3. **User-Specific Tracking**: A separate collection tracks which questions belong to which user, but this information is only accessible to that specific user
4. **Unique IDs**: Users are identified by randomly generated UUIDs rather than personal information

## Component Architecture

The application is built with a modular component architecture featuring well-documented, reusable components:

1. **ClassNameDisplay** - Manages class name creation, display, and session management for professors
2. **QuestionList** - Displays questions with proper controls based on user role (professor/student)
3. **ClassQuestionList** - Provides a read-only view of class questions with status indicators
4. **QuestionForm** - Handles question submission with validation and character limiting
5. **JoinClass** - Allows students to join classes by entering class names
6. **Navbar** - Provides navigation and role changing functionality
7. **ThemeProvider** - Manages theme state and preferences
8. **ThemeToggle** - Inline theme toggle component
9. **FloatingThemeToggle** - Fixed position theme toggle for easy access
10. **Footer** - Displays copyright information and provides theme toggle access

All components feature:
- Detailed JSDoc documentation
- TypeScript interfaces for props
- Responsive design
- Proper handling of loading states
- Support for both light and dark themes

## Setup and Installation

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/classroom-qa.git
cd classroom-qa
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Configure Firebase
   - Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Enable Firestore database
   - Create a `.env.local` file with your Firebase configuration:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

4. Set up Firestore security rules
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

5. Create required Firestore indexes
   - An index for the `questions` collection with fields:
     - `classCode` (Ascending)
     - `timestamp` (Descending)

6. For developers working on the question system:
   - Review the [Question System Documentation](QUESTION_SYSTEM.md) to understand the optimizations and architecture
   - Pay special attention to the caching and debouncing mechanisms when modifying listeners

7. Start the development server
```bash
npm run dev
# or
yarn dev
```

8. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment

### Deploying to Vercel

1. Push your code to a GitHub repository
2. Connect your repository to Vercel
3. Add your Firebase environment variables in the Vercel dashboard:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add each variable from your `.env.local` file
4. Deploy your application

For more detailed deployment instructions, see the [Deployment Guide](DEPLOYMENT.md).

### Production Deployment Preparation

The application has been optimized for production deployment with the following enhancements:

1. **Removed Diagnostic Tools**: All diagnostic and testing utilities have been removed from the production build to reduce bundle size and ensure security.

2. **Optimized Performance**:
   - Implemented caching for active question listeners (10-second debounce)
   - Added local caching for session data to reduce server calls
   - Optimized Firebase queries to minimize data transfer

3. **Enhanced User Experience**:
   - Added audio and visual notifications for new active questions
   - Implemented title bar flashing for important notifications
   - Created fallback mechanisms for environments without audio support

4. **Improved Reliability**:
   - Added manual refresh options for active questions and points
   - Enhanced error handling throughout the application
   - Implemented robust state management for session persistence

5. **Clean Code**:
   - Removed all development-only imports and code
   - Updated documentation to reflect production state
   - Removed console logs and debugging utilities

To deploy to production, follow the standard deployment process after verifying all functionality in a staging environment.

## Firebase Configuration

### Required Services

1. **Firestore Database**: For storing questions and class information
2. **Analytics** (optional): For tracking usage patterns

### Security Rules

For production, use these security rules as a starting point:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Questions collection
    match /questions/{questionId} {
      allow read: if true;
      allow create: if request.resource.data.text != null 
                    && request.resource.data.classCode != null;
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
                    .hasOnly(['status']) || request.resource.data.diff(resource.data).affectedKeys()
                    .hasOnly(['text']);
      allow delete: if true;
    }
    
    // User questions collection
    match /userQuestions/{userQuestionId} {
      allow read, write: if true;
    }
    
    // Class codes collection
    match /classCodes/{codeId} {
      allow read: if true;
      allow create: if request.resource.data.code != null || request.resource.data.className != null;
    }
    
    // Class sessions collection
    match /classSessions/{sessionId} {
      allow read: if true;
      allow create: if request.resource.data.code != null && request.resource.data.professorId != null;
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
                    .hasOnly(['status', 'lastActiveAt', 'lastActive', 'archivedAt']);
      allow delete: if true;
    }
    
    // Joined classes collection
    match /joinedClasses/{joinId} {
      allow read, write: if true;
    }
  }
}
```

### Required Indexes

Create the following composite index in Firestore:

- Collection: `questions`
- Fields:
  - `classCode` (Ascending)
  - `timestamp` (Descending)

## Project Structure

- `src/app/page.tsx` - Role selection page
- `src/app/professor/page.tsx` - Professor dashboard
- `src/app/student/page.tsx` - Student dashboard
- `src/components/` - Reusable UI components
  - `ClassCodeDisplay.tsx` - Class management for professors
  - `ClassQuestionList.tsx` - Read-only question list
  - `Footer.tsx` - Application footer
  - `JoinClass.tsx` - Class joining interface for students
  - `Navbar.tsx` - Application navigation
  - `QuestionForm.tsx` - Question submission interface
  - `QuestionList.tsx` - Interactive question list with role-based controls
  - `ThemeProvider.tsx` - Theme context provider
  - `ThemeToggle.tsx` - Theme toggle button
  - `FloatingThemeToggle.tsx` - Fixed-position theme toggle
- `src/lib/` - Utility functions and Firebase integration
  - `classCode.ts` - Class management functions
  - `classSession.ts` - Session management functions
  - `firebase.ts` - Firebase configuration
  - `questions.ts` - Question management functions
- `src/types/` - TypeScript type definitions

## Question System Documentation

For detailed documentation about the question management system, including performance optimizations, active questions, and the answer system, please refer to the [Question System Documentation](QUESTION_SYSTEM.md).

This comprehensive documentation covers:

- System architecture and overview
- Performance optimizations (caching, debouncing, batch operations)
- Student question functionality
- Active question system
- Answer collection and management
- Points system
- Firebase collections structure
- Debugging and testing tools

Recent improvements to the system include:
- Reduced server calls through smart caching and debouncing
- Enhanced notification system with audio and visual cues
- Improved active question display and management
- More robust error handling and diagnostics
- Manual refresh options for critical data

## Future Enhancements

- **User Authentication**: Optional sign-in for persistent user profiles
- **Question Voting**: Allow students to upvote questions they also want answered
- **Question Grouping**: Group similar questions together to reduce duplication
- **Professor Notifications**: Alert professors when new questions are asked
- **Question Statistics**: Track metrics on question volume, response times, etc.
- **Office Hours Integration**: Allow professors to open virtual office hours sessions
- **Question Templates**: Provide common question templates for students

## Troubleshooting

If you encounter issues with Firebase connectivity or other aspects of the application, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions to common problems.

## License

MIT 