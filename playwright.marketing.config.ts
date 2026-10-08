import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from './playwright.config';

const capture = process.env['CAPTURE_WORKFLOWS'] === '1';
const servers = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  testDir: capture ? './tools/marketing' : './tests/e2e',
  testMatch: capture ? 'capture-workflows.spec.ts' : 'qualified-enquiry.e2e.spec.ts',
  outputDir: join(tmpdir(), 'dukarun-marketing-test-results'),
  reporter: 'line',
  workers: 2,
  timeout: 45_000,
  forbidOnly: base.forbidOnly,
  webServer: servers.filter(server =>
    capture ? /420[23]/.test(server.url ?? '') : /4202/.test(server.url ?? '')
  ),
  use: {
    actionTimeout: 8_000,
    trace: 'retain-on-failure',
    ...(process.env['BROWSER_CHANNEL'] ? { channel: process.env['BROWSER_CHANNEL'] } : {}),
  },
});
