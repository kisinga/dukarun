#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const lockPath = resolve(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages ?? {};
const failures = [];

for (const [dependentPath, metadata] of Object.entries(packages)) {
  if (!dependentPath.startsWith('node_modules/')) continue;
  for (const [name, version] of Object.entries(metadata.optionalDependencies ?? {})) {
    if (!/-linux-x64(?:-|$)/u.test(name)) continue;

    const isLocked = Object.entries(packages).some(
      ([packagePath, candidate]) =>
        packagePath.endsWith(`node_modules/${name}`) && candidate.version === version
    );
    if (!isLocked)
      failures.push(`${name}@${version} required by ${dependentPath || 'workspace root'}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✖ package-lock.json is missing ${failure}`);
  }
  console.error(
    'Declare the native package as a root optionalDependency and regenerate package-lock.json.'
  );
  process.exit(1);
}

console.log('native-dependencies: Linux x64 optional packages are locked.');
