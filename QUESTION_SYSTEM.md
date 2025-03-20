# Question Management System Documentation

This document provides comprehensive documentation for the Question Management System implemented in the Classroom Q&A application. It covers the system architecture, performance optimizations, and usage patterns for both professors and students.

## Table of Contents

- [System Overview](#system-overview)
- [Performance Optimizations](#performance-optimizations)
- [Student Questions](#student-questions)
- [Active Questions](#active-questions)
- [Answer System](#answer-system)
- [Points System](#points-system)
- [Firebase Collections](#firebase-collections)
- [Debugging and Testing](#debugging-and-testing)

## System Overview

The Question Management System is the core of the Classroom Q&A application, enabling real-time interaction between professors and students. The system has been completely rebuilt to provide:

1. **Optimal Performance**: Reduced server calls through caching and debouncing
2. **Real-time Interaction**: Immediate updates for all users
3. **Clear User Experience**: Intuitive interfaces for both professors and students
4. **Robust Error Handling**: Graceful handling of edge cases

The system consists of four main components:

- **Student Questions**: Questions that students ask professors
- **Active Questions**: Questions that professors ask students
- **Answers**: Student responses to active questions
- **Points**: Reward system for student participation

## Performance Optimizations

The system includes several optimizations to reduce server load and enhance user experience:

### Debouncing

All real-time listeners implement a debouncing mechanism that limits the frequency of updates:

```typescript
// Example of debouncing in listenForQuestions
if (timeSinceLastUpdate >= maxWaitTime) {
  sendUpdate(questions);
} else {
  // Set a timer to send the update after the remaining wait time
  const waitTime = Math.max(0, maxWaitTime - timeSinceLastUpdate);
  debounceTimer = setTimeout(() => {
    if (pendingData) {
      sendUpdate(pendingData);
    }
  }, waitTime);
}
```

Key features:
- **Configurable Wait Times**: Different components use appropriate wait times:
  - Active Questions: 10 seconds (critical, but not instantaneous)
  - Class Questions: 15 seconds (less time-sensitive)
  - User Questions: 10 seconds (personalized content)
- **Immediate First Load**: Initial data is sent immediately for quick UI rendering
- **Maximum Wait Guarantee**: Updates are guaranteed within the specified maximum wait time

### Caching

The system implements caching to prevent redundant server calls:

```typescript
// Example of caching in listenForActiveQuestion
// Try to use cached data first for immediate response
if (useCache) {
  const cachedData = cache.questions.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < cache.CACHE_EXPIRATION) {
    console.log(`[listenForActiveQuestion] Using cached active question for session: ${sessionCode}`);
    // Use cached data...
  }
}
```

Key features:
- **Short-term Cache**: 30-second expiration to balance freshness and performance
- **Session-specific Caching**: Data is cached per session code
- **Cache Invalidation**: Cache is updated whenever new data is received
- **Optional Usage**: Caching can be enabled/disabled per listener

### Batch Operations

Related operations are batched to reduce the number of transactions:

```typescript
// Example of batch operations in clearActiveQuestions
if (skipId) {
  const batch = writeBatch(db);
  
  snapshot.docs.forEach(doc => {
    if (doc.id !== skipId) {
      batch.update(doc.ref, { active: false });
    }
  });
  
  await batch.commit();
}
```

## Student Questions

Students can ask questions to professors, which are displayed in real-time on the professor's dashboard.

### Key Features

- **Real-time Updates**: Questions appear immediately for professors
- **Question Management**: Students can edit or delete their own questions
- **Status Tracking**: Questions can be marked as answered or unanswered
- **Ownership Verification**: Only question owners can edit their questions

### Implementation

The system uses two collections for student questions:
- `questions`: Stores the actual question data
- `userQuestions`: Links questions to specific users for personal tracking

This approach preserves student anonymity while allowing students to manage their own questions.

### Code Example: Adding a Question

```typescript
export const addQuestion = async (
  text: string, 
  studentId: string,
  sessionCode: string
): Promise<Question | null> => {
  if (!text.trim() || !studentId || !sessionCode) {
    console.error("Missing required fields for addQuestion:", { text, studentId, sessionCode });
    return null;
  }

  try {
    // Create the question object
    const newQuestion: Omit<Question, "id"> = {
      text: text.trim(),
      timestamp: Date.now(),
      studentId,
      sessionCode,
      status: 'unanswered'
    };
    
    // Add to main questions collection
    const docRef = await addDoc(collection(db, QUESTIONS_COLLECTION), newQuestion);
    
    // Create user-question link for easier querying
    await setDoc(doc(db, USER_QUESTIONS_COLLECTION, docRef.id), {
      questionId: docRef.id,
      studentId,
      sessionCode,
      timestamp: Date.now()
    });
    
    return {
      id: docRef.id,
      ...newQuestion
    };
  } catch (error) {
    console.error("[addQuestion] Error creating question:", error);
    return null;
  }
};
```

## Active Questions

The active question system enables professors to ask questions to the entire class and collect student responses.

### Key Features

- **Single Active Question**: Only one active question can exist at a time per session
- **Real-time Distribution**: Active questions are immediately pushed to all connected students
- **Notification System**: Students receive audio and visual notifications for new questions
- **Answer Collection**: Student answers are collected in real-time
- **Sidebar Display**: Active questions appear in a dedicated sidebar for high visibility

### Implementation

Active questions are stored in the `activeQuestions` collection with a flag indicating whether they are currently active.

### Student Experience

When a professor asks an active question:

1. The question appears immediately in the student's sidebar
2. Students receive an audio notification (with fallback to synthesized sound)
3. The browser title bar flashes to draw attention
4. Students can submit their answer through a simple form
5. Submitted answers are visible to the professor in real-time

### Code Example: Notification System

```typescript
const notifyNewQuestion = (questionText: string) => {
  console.log("Notifying user of new question:", questionText);
  
  // Try to play a notification sound
  try {
    // Try to create a sound programmatically as fallback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext) {
      // Create a simple beep sound
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5 note
      
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1);
    }
  } catch (e) {
    console.log('Error creating audio notification:', e);
    // Fallback to alert only if we couldn't play a sound
    alert(`New question from professor: ${questionText}`);
  }
  
  // Flash the title bar to get user attention
  let originalTitle = document.title;
  let notificationCount = 0;
  const maxFlashes = 5;
  
  const flashTitle = () => {
    if (notificationCount > maxFlashes * 2) {
      document.title = originalTitle;
      return;
    }
    
    document.title = notificationCount % 2 === 0 
      ? '🔔 NEW QUESTION!'
      : originalTitle;
    
    notificationCount++;
    setTimeout(flashTitle, 500);
  };
  
  flashTitle();
};
```

## Answer System

The answer system collects and manages student responses to active questions.

### Key Features

- **Single Answer Per Student**: Students can edit their answer, but only submit one per question
- **Cooldown Period**: After submitting, students have a cooldown period to prevent spam
- **Real-time Updates**: Professor sees answers in real-time as they are submitted
- **Chronological Order**: Answers are displayed in chronological order (oldest first)
- **Context Preservation**: Answers include the question text for better context

### Implementation

Answers are stored in the `answers` collection with references to both the active question and the student who submitted them.

### Code Example: Adding an Answer

```typescript
export const addAnswer = async (
  answerData: {
    text: string,
    activeQuestionId: string,
    studentId: string,
    sessionCode: string,
    questionText?: string
  }
): Promise<string | null> => {
  const { text, activeQuestionId, studentId, sessionCode, questionText } = answerData;
  
  if (!text.trim() || !activeQuestionId || !studentId || !sessionCode) {
    console.error("[addAnswer] Missing required parameters");
    return null;
  }

  try {
    // Check if this student has already answered this question
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('activeQuestionId', '==', activeQuestionId),
      where('studentId', '==', studentId)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      // Student already answered, update their answer
      const existingAnswer = snapshot.docs[0];
      
      await updateDoc(doc(db, ANSWERS_COLLECTION, existingAnswer.id), {
        text: text.trim(),
        updatedAt: Date.now(),
        updated: true
      });
      
      return existingAnswer.id;
    }
    
    // Create new answer
    const docRef = await addDoc(collection(db, ANSWERS_COLLECTION), {
      text: text.trim(),
      activeQuestionId,
      studentId,
      sessionCode,
      questionText,
      timestamp: Date.now()
    });
    
    return docRef.id;
  } catch (error) {
    console.error("[addAnswer] Error adding answer:", error);
    return null;
  }
};
```

## Points System

The points system allows professors to reward students for their participation and quality answers.

### Key Features

- **Reward for Answers**: Professors can award points for student answers
- **Real-time Updates**: Points are updated in real-time for students
- **Local Caching**: Points are cached locally to persist between sessions
- **Prevent Double Awards**: The system prevents awarding points multiple times for the same answer
- **Manual Refresh**: Students can manually refresh their points from the database

### Implementation

Points are stored in the `studentPoints` collection with the student ID as the document ID.

### Code Example: Updating Student Points

```typescript
export const updateStudentPoints = async (
  studentId: string,
  points: number
): Promise<boolean> => {
  if (!studentId) {
    console.error("[updateStudentPoints] No student ID provided");
    return false;
  }

  try {
    // Get current points
    const pointsRef = doc(db, STUDENT_POINTS_COLLECTION, studentId);
    const pointsDoc = await getDoc(pointsRef);
    
    const currentPoints = pointsDoc.exists() ? (pointsDoc.data().total || 0) : 0;
    const newTotal = Math.max(0, currentPoints + points); // Never go below 0
    
    // Update points
    await setDoc(pointsRef, { 
      total: newTotal,
      lastUpdated: Date.now() 
    }, { merge: true });
    
    return true;
  } catch (error) {
    console.error("[updateStudentPoints] Error updating points:", error);
    return false;
  }
};
```

## Firebase Collections

The system uses the following Firestore collections:

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `questions` | Student questions to professors | text, timestamp, studentId, sessionCode, status |
| `userQuestions` | Links between students and their questions | questionId, studentId, sessionCode, timestamp |
| `activeQuestions` | Professor questions to students | text, sessionCode, timestamp, active |
| `answers` | Student responses to active questions | text, activeQuestionId, studentId, sessionCode, timestamp |
| `studentPoints` | Student point totals | total, lastUpdated |
| `classSessions` | Class session management | sessionCode, className, professorId, status, lastActivity |

## Debugging and Testing

The system includes several debugging and testing features:

### Console Logging

The system logs important information to the console for developers:

```typescript
console.log(`[listenForActiveQuestion] Setting up listener for session: ${sessionCode} with maxWaitTime: ${maxWaitTime}ms`);
```

### Error Handling

Robust error handling ensures that the system can recover from failures gracefully:

```typescript
try {
  // Code that might fail
} catch (error) {
  console.error("[Function] Error description:", error);
  // Recover or notify
}
```

These logs and error handling mechanisms make it easier to troubleshoot issues during development. 