import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
