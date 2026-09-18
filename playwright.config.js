import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5176',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://localhost:3006/health',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: '3006',
        DATABASE_URL: 'postgres://auction_user:auction_password@localhost:5433/auction_test'
      },
    },
    {
      command: 'cd apps/web && npx vite --port 5176 --strictPort',
      url: 'http://localhost:5176',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: '5176',
        VITE_API_URL: 'http://localhost:3006'
      }
    },
  ],
});
