/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        heyjave: {
          "primary": "#1a1a73",
          "primary-focus": "#151558",
          "primary-content": "#ffffff",
          "secondary": "#4a4a6a",
          "accent": "#1a73e8",
          "neutral": "#1a1a2e",
          "base-100": "#ffffff",
          "base-200": "#f5f5f5",
          "base-300": "#e8e8e8",
          "info": "#1a73e8",
          "success": "#0d7a2f",
          "warning": "#b86b00",
          "error": "#c02828",
        },
      },
      "light",
      "dark",
    ],
  },
};
