#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const roots = ['apps/site/src/app', 'apps/storefront/src/app'].map(path => resolve(path));
const rules = [
  ['inline SVG', /<svg[\s>]/g],
  ['emoji', /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|✓|✔|✕|✖/gu],
  ['heavy shadow', /shadow-(?:xl|2xl)(?![\w-])/g],
  ['hand-built Dukarun attribution', /Powered by Dukarun/g],
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (['.ts', '.html', '.scss', '.css'].includes(extname(path))) yield path;
  }
}

let failures = 0;
for (const root of roots) {
  for (const file of files(root)) {
    if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const [label, pattern] of rules) {
      if (
        label === 'hand-built Dukarun attribution' &&
        file.endsWith('powered-by-dukarun.component.ts')
      )
        continue;
      pattern.lastIndex = 0;
      if (pattern.test(source)) {
        console.error(`✖ ${file}: ${label}`);
        failures++;
      }
    }
  }
}

if (failures) process.exit(1);
console.log('public-design: clean.');
