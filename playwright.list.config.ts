import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  workers: 2,
  grepInvert: /@critical/,
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter(server => server.url?.includes('4203'))
    : base.webServer,
  projects: [
    { name: 'list-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'list-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'list-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'list-webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
