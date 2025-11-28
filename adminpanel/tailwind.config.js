/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'deep-blue': '#0A1172',
        'teal': '#0E7C7B',
        'silver': '#C0C0C0',
        'slate-gray': '#708090',
        'emerald': '#047669',
        'indigo': '#281E5D',
      },
    },
  },
  plugins: [],
}