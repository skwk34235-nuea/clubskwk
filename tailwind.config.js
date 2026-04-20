/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        skwkBlue: '#0c3a6a',
        skwkPink: '#e83e8c',
      }
    },
  },
  plugins: [],
}
