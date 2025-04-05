import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

interface Question {
  id: string;
  text: string;
  studentId: string;
  studentName: string;
  timestamp: number;
  isProfessor: boolean;
  isActive?: boolean;
}

interface Answer {
  id: string;
  questionId: string;
  studentId: string;
  studentName: string;
  text: string;
  timestamp: number;
  points?: number;
}

interface Session {
  students: string[];
  professor: string | null;
  questions: Question[]; // All questions (both student and professor)
  activeQuestion: Question | null; // Current professor question
  answers: Answer[];
  points: { [studentId: string]: number };
}

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Store active sessions
const sessions: { [sessionCode: string]: Session } = {};

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('joinClass', ({ sessionCode, userId, isProfessor }) => {
    console.log(`User ${userId} joining session ${sessionCode}`);

    // Create session if it doesn't exist
    if (!sessions[sessionCode]) {
      sessions[sessionCode] = {
        students: [],
        professor: null,
        questions: [],
        answers: [],
        points: {},
        activeQuestion: null
      };
    }

    // Add user to session
    if (isProfessor) {
      sessions[sessionCode].professor = userId;
    } else {
      if (!sessions[sessionCode].students.includes(userId)) {
        sessions[sessionCode].students.push(userId);
        sessions[sessionCode].points[userId] = 0;
      }
    }

    // Join socket room
    socket.join(sessionCode);

    // Notify room of updated student list
    io.to(sessionCode).emit('sessionUpdate', {
      students: sessions[sessionCode].students
    });

    // Send existing questions to new user
    sessions[sessionCode].questions.forEach(question => {
      socket.emit('questionCreated', question);
    });

    // Send existing answers to new user
    sessions[sessionCode].answers.forEach(answer => {
      socket.emit('answerUpdate', answer);
    });
  });

  socket.on('createQuestion', (question: Omit<Question, 'id' | 'timestamp'>) => {
    console.log('Question created:', question);

    // Find session by checking all sessions
    const sessionCode = Object.keys(sessions).find(code => {
      const session = sessions[code];
      return session.professor === question.studentId || session.students.includes(question.studentId);
    });

    if (sessionCode && sessions[sessionCode]) {
      console.log(`Processing question for session ${sessionCode}`);
      
      // If this is a professor question, handle it as the active question
      if (question.isProfessor) {
        // Clear previous answers when a new professor question is created
        sessions[sessionCode].answers = [];
        
        // Set as active question
        const activeQuestion: Question = {
          ...question,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          isActive: true
        };
        sessions[sessionCode].activeQuestion = activeQuestion;
        
        // Broadcast that the previous question has ended
        if (sessions[sessionCode].activeQuestion) {
          io.to(sessionCode).emit('questionEnded', sessions[sessionCode].activeQuestion.id);
        }
        
        // Broadcast the new active question
        io.to(sessionCode).emit('activeQuestionUpdate', activeQuestion);
      } else {
        // For student questions, add to general questions list
        const newQuestion: Question = {
          ...question,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          isActive: false
        };
        sessions[sessionCode].questions.push(newQuestion);
        io.to(sessionCode).emit('questionCreated', newQuestion);
      }
      
      console.log('Current session state:', {
        sessionCode,
        professor: sessions[sessionCode].professor,
        students: sessions[sessionCode].students,
        questions: sessions[sessionCode].questions,
        activeQuestion: sessions[sessionCode].activeQuestion
      });
    }
  });

  socket.on('createAnswer', (answer: Answer) => {
    console.log('Answer created:', answer);

    // Find session by checking all sessions
    const sessionCode = Object.keys(sessions).find(code => {
      const session = sessions[code];
      return session.students.includes(answer.studentId);
    });

    if (sessionCode && sessions[sessionCode]) {
      // Verify this answer is for the current active question
      if (sessions[sessionCode].activeQuestion?.id === answer.questionId) {
        sessions[sessionCode].answers.push(answer);
        io.to(sessionCode).emit('answerUpdate', answer);
      }
    }
  });

  socket.on('endQuestion', (questionId: string) => {
    console.log('Question ended:', questionId);

    // Find session by checking all sessions
    const sessionCode = Object.keys(sessions).find(code => {
      const session = sessions[code];
      return session.activeQuestion?.id === questionId;
    });

    if (sessionCode && sessions[sessionCode]) {
      // Clear active question and answers
      sessions[sessionCode].activeQuestion = null;
      sessions[sessionCode].answers = [];
      
      // Broadcast updates
      io.to(sessionCode).emit('questionEnded', questionId);
      io.to(sessionCode).emit('activeQuestionUpdate', null);
    }
  });

  socket.on('awardPoints', ({ studentId, points }) => {
    console.log(`Awarding ${points} points to student ${studentId}`);

    // Find session by checking all sessions
    const sessionCode = Object.keys(sessions).find(code => {
      const session = sessions[code];
      return session.students.includes(studentId);
    });

    if (sessionCode && sessions[sessionCode]) {
      // Update student points
      sessions[sessionCode].points[studentId] = (sessions[sessionCode].points[studentId] || 0) + points;

      // Broadcast updated points to room
      io.to(sessionCode).emit('pointsUpdate', {
        studentId,
        points: sessions[sessionCode].points[studentId]
      });
    }
  });

  socket.on('deleteQuestion', (questionId: string) => {
    console.log('Question deleted:', questionId);

    // Find the session containing this question
    const sessionCode = Object.keys(sessions).find(code => {
      const session = sessions[code];
      return session.questions.some(q => q.id === questionId);
    });

    if (sessionCode && sessions[sessionCode]) {
      // Remove the question from the session
      sessions[sessionCode].questions = sessions[sessionCode].questions.filter(q => q.id !== questionId);
      
      // Broadcast the deletion to all clients in the session
      io.to(sessionCode).emit('questionDeleted', questionId);
      
      // Also broadcast the updated session state
      io.to(sessionCode).emit('sessionUpdate', {
        students: sessions[sessionCode].students,
        questions: sessions[sessionCode].questions,
        activeQuestion: sessions[sessionCode].activeQuestion
      });
      
      console.log('Question deleted from session:', sessionCode);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 