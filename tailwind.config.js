/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        glbm: {
          green: "#00A651",
          lime: "#8CC63F",
          ink: "#0D110D",
        },
      },
    },
  },
  plugins: [],
};
