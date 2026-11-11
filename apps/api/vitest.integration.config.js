import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.js'],
    globalSetup: ['tests/integration/setup/globalSetup.js'],
    setupFiles: ['tests/integration/setup/env.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
    teardownTimeout: 30000,
  },
});
