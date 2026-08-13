#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const activeAngularApps = ['web', 'site', 'storefront', 'super-admin'];
const failures = [];

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.angular')
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

function fail(path, message) {
  failures.push(`${relative(root, path)}: ${message}`);
}

for (const path of files(join(root, 'scripts'))) {
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)) {
    fail(path, 'tests cannot live in the operational scripts directory');
  }
}

const unitConfigPath = join(root, 'vitest.unit.config.ts');
const unitConfig = readFileSync(unitConfigPath, 'utf8');
if (!/environment:\s*['"]node['"]/.test(unitConfig)) {
  fail(unitConfigPath, 'pure unit tests must run in the Node environment');
}

for (const app of activeAngularApps) {
  const angularConfigPath = join(root, 'apps', app, 'angular.json');
  const angularConfig = JSON.parse(readFileSync(angularConfigPath, 'utf8'));
  if (angularConfig.projects?.[app]?.architect?.['test-unit']) {
    fail(
      angularConfigPath,
      'pure unit tests cannot run through the Angular component test builder'
    );
  }
  const sourceRoot = join(root, 'apps', app, 'src');
  for (const path of files(sourceRoot)) {
    if (!/\.(?:spec|test)\.ts$/.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    if (!/\.(?:unit|component)\.spec\.ts$/.test(path)) {
      fail(path, 'Angular tests must declare either the unit or component lane in the filename');
    }
    if (
      path.endsWith('.unit.spec.ts') &&
      /@angular\/core\/testing|\bTestBed\b|\b(?:document|window)\b/.test(source)
    ) {
      fail(path, 'unit tests cannot use Angular TestBed or browser globals');
    }
    if (path.endsWith('.component.spec.ts') && !/\bTestBed\b/.test(source)) {
      fail(path, 'component tests must exercise an Angular TestBed fixture');
    }
    if (/toMatch(?:Inline)?Snapshot\s*\(/.test(source)) {
      fail(path, 'snapshot assertions are intentionally disabled; assert behaviour explicitly');
    }
  }
}

for (const path of files(join(root, 'apps/web/src/app'))) {
  if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) continue;
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function inspect(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'Promise' &&
      node.expression.name.text === 'all' &&
      /\b(?:transactableAccounts|cashierAccounts)\s*\(/.test(node.getText(sourceFile))
    ) {
      fail(
        path,
        'account-option reads cannot share Promise.all with other page data; use an independent load lane'
      );
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

const laneRules = [
  ['tests/contracts', '.contract.spec.mjs'],
  ['tests/api', '.api.spec.mjs'],
  ['tests/e2e', '.e2e.spec.ts'],
  ['tests/artifacts', '.artifact.spec.mjs'],
  ['supabase/tests/concurrency', '.concurrency.spec.mjs'],
];
for (const [directory, suffix] of laneRules) {
  const absolute = join(root, directory);
  for (const path of files(absolute)) {
    if (extname(path) === '.md' || path.endsWith('.json')) continue;
    if (!path.endsWith(suffix)) fail(path, `files in this lane must end with ${suffix}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}

console.log('test-boundaries: test lanes are clean.');
