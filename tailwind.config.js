/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6FAFB',      // the board — soft off-white with a cyan cast
        card: '#FFFFFF',
        ink: '#103A44',        // deep teal-ink, never pure black
        mist: '#5B7C85',       // secondary text
        hairline: '#D3E7EB',
        cyan: {
          DEFAULT: '#0EA5B7',
          deep: '#0B6E7C',
          wash: '#E4F5F7',
          soft: '#7FD3DD',
        },
        rose: '#E86A6A',
        slate: {
          quiet: '#7A9299',    // deceased / sibling lines
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,58,68,0.06), 0 6px 16px rgba(16,58,68,0.08)',
        lift: '0 4px 12px rgba(16,58,68,0.10), 0 16px 40px rgba(16,58,68,0.14)',
        rail: '1px 0 0 rgba(16,58,68,0.08)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
