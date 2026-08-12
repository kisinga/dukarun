import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    trace: { mode: 'retain-on-failure', screenshots: false },
    screenshot: 'off',
    video: 'off',
  },
  grep: /@critical/,
  webServer: {
    command: 'npm start -w @dukarun/web -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4203/login',
    reuseExistingServer: !process.env.CI,
  },
});
