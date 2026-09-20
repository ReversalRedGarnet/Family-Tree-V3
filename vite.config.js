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
  // Mostly pure-logic unit tests (see src/utils/*.test.js) — no DOM needed,
  // so the default 'node' environment is enough and keeps them fast. The one
  // exception, src/hooks/useDriveSync.test.js, opts into 'jsdom' itself via
  // a per-file `@vitest-environment` comment, since it renders the hook
  // through React Testing Library.
  test: {
    include: ['src/**/*.test.js'],
  },
});
