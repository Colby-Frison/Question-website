/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode colors only
        primary: {
          DEFAULT: "#495464", // Dark blue-gray
          hover: "#3A4350",
          light: "#BBBFCA",
          dark: "#2A3038",
          50: "#F4F4F2",
          100: "#E8E8E8",
          200: "#DCDCDC",
          300: "#BBBFCA",
          400: "#A4A9B7",
          500: "#8D93A4",
          600: "#767D91",
          700: "#5F677E",
          800: "#495464",
          900: "#3A4350",
        },
        accent: {
          DEFAULT: "#BBBFCA", // Medium blue-gray
          hover: "#A4A9B7",
          light: "#E8E8E8",
          dark: "#495464",
        },
        background: {
          DEFAULT: "#F4F4F2", // Light gray/off-white
          secondary: "#E8E8E8", // Slightly darker gray
          tertiary: "#BBBFCA", // Medium blue-gray
        },
        text: {
          DEFAULT: "#495464", // Dark blue-gray
          secondary: "#5F677E", // Medium blue-gray
          tertiary: "#767D91", // Light blue-gray
          inverted: "#F4F4F2", // Light gray/off-white
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
      },
    },
  },
  plugins: [],
}; 