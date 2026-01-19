/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        serif: ['"Merriweather"', '"Georgia"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        // Claude-inspired colors (warm, minimal, sophisticated)
        background: '#FDFDFC', // Very light warm gray/white
        surface: '#F4F3F2', // Slightly darker warm gray
        border: '#E6E4E2',
        input: '#F0EFEF',
        
        primary: {
          DEFAULT: '#D96C46', // Warm terracotta/orange accent (Claude-ish)
          foreground: '#FFFFFF',
          hover: '#C75E3B'
        },
        
        text: {
          primary: '#333333', // Soft black
          secondary: '#666666', // Medium gray
          muted: '#999999',
        },

        // Notebook/YouMind Layout specific
        panel: {
          input: '#FAF9F8',
          process: '#F5F4F3',
          output: '#FFFFFF',
        }
      }
    },
  },
  plugins: [],
}
