/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          hover: '#4F46E5',
          light: '#EEF2FF',
          dark: '#818CF8',
        },
        'page-bg': {
          DEFAULT: '#F4F4F2',
          dark: '#161618',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#202023',
        },
        'border-subtle': {
          DEFAULT: '#E5E7EB',
          dark: '#2C2C30',
        },
        'text-main': {
          DEFAULT: '#374151',
          dark: '#D1D5DB',
        },
        'text-muted': '#9CA3AF',
        accent: {
          rose: '#F4A0A0',
          peach: '#F5C6A0',
          sage: '#A8C5BD',
        },
        status: {
          resolved: '#10B981',
          eraser: '#E11D48',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
