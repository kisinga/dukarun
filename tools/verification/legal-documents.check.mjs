#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const types = ['privacy', 'terms', 'dpa', 'subprocessors'];
const reviewMarkers =
  /(\bTBD\b|TO BE VERIFIED|counsel must|before publication|\[[A-Z][A-Z _-]{2,}\])/i;
let failed = false;

for (const type of types) {
  const url = new URL(`../../docs/legal/documents/${type}.md`, import.meta.url);
  const source = readFileSync(url, 'utf8');
  const normalized = source.replace(/\r\n?/g, '\n');
  const issues = [];
  if (!normalized.startsWith('# ')) issues.push('must start with one level-one heading');
  if (!normalized.endsWith('\n')) issues.push('must end with a newline');
  if (!/^## /m.test(normalized)) issues.push('must contain section headings');
  if (/<[A-Za-z/!][^>]*>/.test(normalized)) issues.push('raw HTML is not allowed');
  if (reviewMarkers.test(normalized)) issues.push('contains an unresolved review marker');
  const hash = createHash('sha256').update(normalized).digest('hex');
  console.log(`${type} ${hash}${issues.length ? ` ERROR: ${issues.join('; ')}` : ''}`);
  failed ||= issues.length > 0;
}

if (failed) process.exitCode = 1;
