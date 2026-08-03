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
        background: {
          light: '#F4F4F2',
          dark: '#161618',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#202023',
        },
        border: {
          light: '#E5E7EB',
          dark: '#2C2C30',
        },
        accent: {
          DEFAULT: '#6366F1',
          hover: '#4F46E5',
          eraser: '#E11D48',
          resolved: '#10B981',
        }
      },
    },
  },
  plugins: [],
}
