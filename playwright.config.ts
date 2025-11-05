import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.BASE_URL ||
  process.env.PHASE1_URL ||
  'https://app.asimo.io/index.html';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 20_000,
  },
  reporter: [['line']],
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'ios-wk',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
