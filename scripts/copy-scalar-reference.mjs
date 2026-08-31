#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scalarVersion = '1.67.0';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repositoryRoot, 'node_modules/@scalar/api-reference');
const packageMetadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

if (packageMetadata.version !== scalarVersion) {
  throw new Error(`Expected Scalar ${scalarVersion}; found ${packageMetadata.version}.`);
}

const source = resolve(packageRoot, 'dist/browser/standalone.js');
const destination = resolve(
  repositoryRoot,
  `apps/site/public/vendor/scalar/${scalarVersion}/standalone.js`
);
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`[scalar:site] copied Scalar ${scalarVersion} standalone bundle`);
