import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // On GitHub Pages, a project site is served from /<repo-name>/, not /.
  // The deploy workflow sets VITE_BASE_PATH automatically; for local dev
  // or any other host, it just falls back to '/'.
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    open: true,
  },
  // React and Konva are most of the boot bundle and change far less often
  // than the app itself, so they get chunks of their own: a new release
  // only re-downloads the app's code, and no single chunk trips the 500 kB
  // warning. (jsPDF and its helpers are already split off, loaded only on
  // a PDF export.)
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'konva', test: /[\\/]node_modules[\\/](konva|react-konva|react-reconciler|its-fine)[\\/]/ },
          ],
        },
      },
    },
  },
  // Mostly pure-logic unit tests (see src/utils/*.test.js) — no DOM needed,
  // so the default 'node' environment is enough and keeps them fast. The few
  // that render through React Testing Library (useDriveSync, ErrorBoundary)
  // opt into 'jsdom' themselves via a per-file `@vitest-environment` comment.
  test: {
    include: ['src/**/*.test.js'],
  },
});
