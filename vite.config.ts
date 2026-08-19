import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` targets GitHub Pages project hosting (/<repo>/). Local dev and preview
// serve from the same path, so a broken asset URL shows up before deployment.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/living-city/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Three.js is most of the bundle and changes only when the dependency is
        // upgraded. Splitting it out means edits to the game ship a small chunk and
        // leave the renderer cached. It does not make the first load faster — everything
        // here is needed to draw the first frame.
        advancedChunks: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
    // The three chunk is legitimately large; warning about it every build trains the
    // warning to be ignored.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
