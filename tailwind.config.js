/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode colors - Unified blue theme
        primary: {
          DEFAULT: "#3b82f6", // Blue
          hover: "#2563eb",
          light: "#93c5fd",
          dark: "#1d4ed8",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        accent: {
          DEFAULT: "#f97316", // Orange accent
          hover: "#ea580c",
          light: "#fdba74",
          dark: "#c2410c",
        },
        background: {
          DEFAULT: "#ffffff", // Pure white background
          secondary: "#f1f5f9", // Very light blue-gray
          tertiary: "#e2e8f0", // Light blue-gray
        },
        text: {
          DEFAULT: "#0f172a", // Very dark blue-gray
          secondary: "#334155", // Dark blue-gray
          tertiary: "#64748b", // Medium blue-gray
          inverted: "#ffffff",
        },
        
        // Dark mode colors (Purple theme)
        dark: {
          primary: {
            DEFAULT: "#9580ff", // Purple
            hover: "#b8a8ff",
            light: "#d4caff",
            dark: "#7b68ee",
            50: "#f5f3ff",
            100: "#ede9fe",
            200: "#ddd6fe",
            300: "#c4b5fd",
            400: "#a78bfa",
            500: "#8b5cf6",
            600: "#7c3aed",
            700: "#6d28d9",
            800: "#5b21b6",
            900: "#4c1d95",
          },
          accent: {
            DEFAULT: "#fb7185", // Pink accent
            hover: "#f43f5e",
            light: "#fda4af",
            dark: "#e11d48",
          },
          background: {
            DEFAULT: "#1e1e2e", // Dark gray with slight purple tint
            secondary: "#2a2a3c", // Slightly lighter
            tertiary: "#363646", // Even lighter
          },
          text: {
            DEFAULT: "#e2e8f0", // Very light gray
            secondary: "#cbd5e1", // Light gray
            tertiary: "#94a3b8", // Medium gray
            inverted: "#1e1e2e",
          },
        },
        
        // Status colors
        success: {
          DEFAULT: "#10b981", // Green
          light: "#a7f3d0",
          dark: "#059669",
        },
        warning: {
          DEFAULT: "#f59e0b", // Amber
          light: "#fcd34d",
          dark: "#d97706",
        },
        error: {
          DEFAULT: "#ef4444", // Red
          light: "#fca5a5",
          dark: "#dc2626",
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      screens: {
        'xs': '475px',
        // Default Tailwind breakpoints
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      borderRadius: {
        'sm': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
        'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}; 