# Classroom Q&A

A web application for students to anonymously ask questions to their professors without having to raise their hand.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Setup and Installation](#setup-and-installation)
- [Deployment](#deployment)
- [Firebase Configuration](#firebase-configuration)
- [Project Structure](#project-structure)
- [Future Enhancements](#future-enhancements)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Overview

Classroom Q&A is designed to enhance classroom engagement by allowing students to ask questions anonymously. This reduces the anxiety associated with raising hands in class and ensures that all students have an equal opportunity to have their questions addressed.

## Features

- **Anonymous Questions**: Students can ask questions without revealing their identity to others
- **Professor Interface**: Create class codes, view and manage student questions
- **Student Interface**: Join classes using codes, submit anonymous questions
- **Real-time Updates**: Questions appear in real-time for professors
- **Cross-Device Support**: Works across multiple devices with Firebase integration

## Technology Stack

- **Frontend**: Next.js with React and TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore for real-time data synchronization
- **State Management**: React Hooks
- **Analytics**: Firebase Analytics

## How It Works

### Role Selection

When users first access the application, they select their role:
- **Professor**: Creates and manages classes, views and responds to questions
- **Student**: Joins classes and submits questions anonymously

### Class Management

1. **Professor Creates Class**: 
   - A professor is automatically assigned a unique class code
   - This code can be shared with students to join the class

2. **Student Joins Class**:
   - Students enter the class code provided by their professor
   - Once joined, they can start asking questions

### Question Flow

1. **Student Submits Question**:
   - Student types and submits a question
   - Question is stored in Firebase with the class code but without student identifiers
   - A separate record links the question to the student (for their reference only)

2. **Professor Views Questions**:
   - All questions for the class appear in real-time on the professor's dashboard
   - Questions are ordered by timestamp (newest first)
   - Professor can delete questions as needed

3. **Real-time Updates**:
   - Firebase Firestore provides real-time synchronization
   - New questions appear immediately without refreshing the page

### Data Structure

The application uses four main Firestore collections:

1. **questions**: Stores all questions with class codes but no student identifiers
2. **userQuestions**: Links questions to specific users (for their own reference)
3. **classCodes**: Stores class codes created by professors
4. **joinedClasses**: Tracks which students have joined which classes

### Anonymity Preservation

Student anonymity is preserved through several mechanisms:

1. **No Personal Information**: Questions are stored without any identifying information
2. **Separate Collections**: Questions are stored in a global collection without user IDs
3. **User-Specific Tracking**: A separate collection tracks which questions belong to which user, but this information is only accessible to that specific user
4. **Unique IDs**: Users are identified by randomly generated UUIDs rather than personal information

## Setup and Installation

### Prerequisites

- Node.js (v14 or later)
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

6. Start the development server
```bash
npm run dev
# or
yarn dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

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
- `src/lib/` - Utility functions and Firebase integration
- `src/types/` - TypeScript type definitions

## Future Enhancements

See [TODO.md](TODO.md) for planned enhancements and features.

## Troubleshooting

If you encounter issues with Firebase connectivity or other aspects of the application, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions to common problems.

## License

MIT 