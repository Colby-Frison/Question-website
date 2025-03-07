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
        // Light mode colors
        primary: {
          DEFAULT: "#3b82f6", // Blue
          hover: "#2563eb",
          light: "#93c5fd",
          dark: "#1d4ed8",
        },
        secondary: {
          DEFAULT: "#10b981", // Green
          hover: "#059669",
          light: "#6ee7b7",
          dark: "#047857",
        },
        background: {
          DEFAULT: "#ffffff",
          secondary: "#f3f4f6",
          tertiary: "#e5e7eb",
        },
        text: {
          DEFAULT: "#1f2937",
          secondary: "#4b5563",
          tertiary: "#6b7280",
          inverted: "#ffffff",
        },
        
        // Dark mode colors (Obsidian-inspired)
        dark: {
          primary: {
            DEFAULT: "#9580ff", // Purple
            hover: "#b8a8ff",
            light: "#d4caff",
            dark: "#7b68ee",
          },
          secondary: {
            DEFAULT: "#a277ff", // Lighter purple
            hover: "#b99aff",
            light: "#d0bdff",
            dark: "#8a5cf7",
          },
          background: {
            DEFAULT: "#1e1e2e", // Dark gray
            secondary: "#2a2a3c",
            tertiary: "#363646",
          },
          text: {
            DEFAULT: "#e2e8f0",
            secondary: "#cbd5e1",
            tertiary: "#94a3b8",
            inverted: "#1e1e2e",
          },
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