#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = {
  ...process.env,
  SITE_PUBLIC_URL: process.env.SITE_PUBLIC_URL || 'https://dukarun.com',
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || 'https://app.dukarun.com',
  STOREFRONT_PUBLIC_URL: process.env.STOREFRONT_PUBLIC_URL || 'https://store.dukarun.com',
};

for (const script of ['build:site', 'build:web', 'build:storefront', 'build:super-admin']) {
  const result = spawnSync(npm, ['run', script], { env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
