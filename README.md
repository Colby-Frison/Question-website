# Classroom Q&A

A web application for students to anonymously ask questions to their professors without having to raise their hand.

## Features

- **User Authentication**: Simple email/password authentication
- **Professor Interface**: Create class codes, view and manage student questions
- **Student Interface**: Join classes using codes, submit anonymous questions
- **Real-time Updates**: Questions appear in real-time for professors

## Technology Stack

- **Frontend**: Next.js with React and TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Hooks and localStorage (no database required)

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

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

3. Start the development server
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Login**: Use any email/password combination (no actual authentication in this demo)
2. **Professor**: Select "Professor" role to create a class code
3. **Student**: Select "Student" role to join a class using a code
4. **Ask Questions**: Students can submit questions anonymously
5. **View Questions**: Professors can see all questions in real-time

## Project Structure

- `src/app/page.tsx` - Login page
- `src/app/professor/page.tsx` - Professor dashboard
- `src/app/student/page.tsx` - Student dashboard
- `src/app/layout.tsx` - Main layout component
- `src/app/globals.css` - Global styles

## Notes

This application uses localStorage for data persistence, which means:
- Data is stored only in the browser
- Data will be lost if the browser storage is cleared
- In a production environment, you would want to use a proper database

## License

MIT 