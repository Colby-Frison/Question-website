# Question Website

A real-time question and answer platform for educational settings, featuring WebSocket-based communication between professors and students.

## Project Structure

```
project-root/
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   ├── components/      # React components
│   │   ├── services/        # API and WebSocket services
│   │   ├── hooks/          # Custom React hooks
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   ├── contexts/       # React contexts
│   │   └── styles/         # Global styles
│
├── backend/                 # WebSocket server
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── services/       # Business logic
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   └── index.ts        # Main server file
```

## Features

- Real-time communication using WebSockets
- Professor and student interfaces
- Question and answer system
- Points tracking
- Like/unlike functionality
- Session management

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- TypeScript

## Setup Instructions

1. Clone the repository:
```bash
git clone [repository-url]
cd question-website
```

2. Install dependencies:
```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Set up environment variables:
```bash
# Frontend (.env.local)
NEXT_PUBLIC_WEBSOCKET_URL=http://localhost:3001

# Backend (.env)
PORT=3001
CLIENT_URL=http://localhost:3000
```

4. Start the development servers:
```bash
# Start backend server
cd backend
npm run dev

# Start frontend server (in a new terminal)
cd frontend
npm run dev
```

## Development

- Frontend runs on http://localhost:3000
- Backend runs on http://localhost:3001

## Available Scripts

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run linter
- `npm run test` - Run tests

### Backend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run linter
- `npm run test` - Run tests

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 