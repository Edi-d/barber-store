/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // LinkedIn Blue palette
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc4ff',
          400: '#36a5ff',
          500: '#0a85f4',
          600: '#0a66c2',
          700: '#0b5394',
          800: '#0f457a',
          900: '#133c65',
          950: '#0c2544',
        },
        // Light theme grays
        dark: {
          50: '#ffffff',
          100: '#f8fafc',
          200: '#f1f5f9',
          300: '#e2e8f0',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#f3f2ef',
          900: '#ffffff',
          950: '#f8fafc',
        },
        accent: {
          gold: '#d4af37',
          cream: '#f5f5dc',
        },
      },
    },
  },
  plugins: [],
};
