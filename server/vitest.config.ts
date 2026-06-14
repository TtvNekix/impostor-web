import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@impostor/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
