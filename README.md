# Classroom Q&A

A web application for students to anonymously ask questions to their professors without having to raise their hand.

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

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Firebase account (for production use)

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
   - Replace the Firebase configuration in `src/lib/firebase.ts` with your own
   - Set up Firestore security rules (see below)

4. Test Firebase connectivity
```bash
node src/lib/test-firebase.js
```

5. Start the development server
```bash
npm run dev
# or
yarn dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Select Role**: Choose whether you are a student or professor
2. **Professor**: You'll automatically get a class code to share with students
3. **Student**: Enter a class code to join a class
4. **Ask Questions**: Students can submit questions anonymously
5. **View Questions**: Professors can see all questions in real-time

## How Anonymity Works

The application preserves student anonymity through several mechanisms:

1. **No Personal Information**: Questions are stored without any identifying information
2. **Separate Collections**: Questions are stored in a global collection without user IDs
3. **User-Specific Tracking**: A separate collection tracks which questions belong to which user, but this information is only accessible to that specific user
4. **Unique IDs**: Users are identified by randomly generated UUIDs rather than personal information

## Deployment

### Deploying to Vercel (Recommended)

1. Push your code to a GitHub repository
2. Connect your repository to Vercel
3. During setup, add your Firebase environment variables if you're using them
4. Deploy your application

Your Firebase integration will work without any additional database setup on Vercel's side. The application will continue to use your Firebase Firestore database for data storage and real-time updates.

For more detailed deployment instructions, see the [Deployment Guide](DEPLOYMENT.md).

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

## Troubleshooting

If you encounter issues with Firebase connectivity or other aspects of the application, please refer to the [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions to common problems.

## Project Structure

- `src/app/page.tsx` - Role selection page
- `src/app/professor/page.tsx` - Professor dashboard
- `src/app/student/page.tsx` - Student dashboard
- `src/components/` - Reusable UI components
- `src/lib/` - Utility functions and Firebase integration
- `src/types/` - TypeScript type definitions

## License

MIT 