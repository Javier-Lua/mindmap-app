/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: {
          bg: '#111111',
          dot: '#333333',
          node: '#1e1e1e',
          border: '#2e2e2e',
          borderSelected: '#4488ff',
          text: '#dcddde',
          textMuted: '#999999',
        }
      }
    },
  },
  plugins: [],
}