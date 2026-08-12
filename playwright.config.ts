import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    trace: { mode: 'retain-on-failure', screenshots: false },
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: 'npm start -w @dukarun/site -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4202',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm start -w @dukarun/web -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4203/login',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm start -w @dukarun/storefront -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4204',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm start -w @dukarun/super-admin -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4205/login',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'mocked-desktop',
      grepInvert: /@critical/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mocked-mobile',
      grepInvert: /@critical/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
