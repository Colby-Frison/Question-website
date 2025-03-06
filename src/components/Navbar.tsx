'use client';

import Link from 'next/link';

interface NavbarProps {
  userType: 'student' | 'professor';
  onLogout: () => void;
}

export default function Navbar({ userType, onLogout }: NavbarProps) {
  return (
    <nav className="bg-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-primary">
                Classroom Q&A
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">
                {userType === 'professor' ? 'Professor' : 'Student'} Dashboard
              </span>
              <button
                onClick={onLogout}
                className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Change Role
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
} 