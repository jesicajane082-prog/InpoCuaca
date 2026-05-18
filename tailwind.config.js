/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#f8fafc',
          DEFAULT: '#64748b',
          dark: '#0f172a',
        },
      },
    },
  },
  plugins: [],
}
