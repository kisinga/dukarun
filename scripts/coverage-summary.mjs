#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const coverageTargets = [
  { label: 'Backend', path: 'backend/coverage/lcov.info' },
  { label: 'Frontend', path: 'frontend/coverage/lcov.info' },
];

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const value = process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1];
  args.set(arg, value ?? true);
  if (value !== true) i += 1;
}

function parseLcov(filePath) {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return null;

  const totals = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  };

  for (const line of content.split(/\r?\n/)) {
    const [key, rawValue] = line.split(':');
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    if (key === 'LF') totals.linesFound += value;
    if (key === 'LH') totals.linesHit += value;
    if (key === 'FNF') totals.functionsFound += value;
    if (key === 'FNH') totals.functionsHit += value;
    if (key === 'BRF') totals.branchesFound += value;
    if (key === 'BRH') totals.branchesHit += value;
  }

  if (totals.linesFound === 0 && totals.functionsFound === 0 && totals.branchesFound === 0) {
    return null;
  }

  return totals;
}

function percent(hit, found) {
  if (!found) return null;
  return (hit / found) * 100;
}

function formatPercent(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)}%`;
}

function mergeTotals(items) {
  return items.reduce(
    (total, item) => ({
      linesFound: total.linesFound + item.linesFound,
      linesHit: total.linesHit + item.linesHit,
      functionsFound: total.functionsFound + item.functionsFound,
      functionsHit: total.functionsHit + item.functionsHit,
      branchesFound: total.branchesFound + item.branchesFound,
      branchesHit: total.branchesHit + item.branchesHit,
    }),
    {
      linesFound: 0,
      linesHit: 0,
      functionsFound: 0,
      functionsHit: 0,
      branchesFound: 0,
      branchesHit: 0,
    },
  );
}

function toRow(label, totals) {
  if (!totals) {
    return `| ${label} | missing | missing | missing |`;
  }

  const lines = formatPercent(percent(totals.linesHit, totals.linesFound));
  const functions = formatPercent(percent(totals.functionsHit, totals.functionsFound));
  const branches = formatPercent(percent(totals.branchesHit, totals.branchesFound));

  return `| ${label} | ${lines} | ${functions} | ${branches} |`;
}

function colorForCoverage(value) {
  if (value === null) return '#6e7781';
  if (value >= 80) return '#2da44e';
  if (value >= 60) return '#bf8700';
  return '#cf222e';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function badgeSvg(label, message, color) {
  const labelWidth = 63;
  const messageWidth = Math.max(56, message.length * 7 + 10);
  const width = labelWidth + messageWidth;
  const messageX = labelWidth + messageWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(
    `${label}: ${message}`,
  )}">
  <title>${escapeXml(`${label}: ${message}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${messageX}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(message)}</text>
    <text x="${messageX}" y="14">${escapeXml(message)}</text>
  </g>
</svg>
`;
}

const results = coverageTargets.map(target => ({
  ...target,
  totals: parseLcov(target.path),
}));
const complete = results.every(result => result.totals);
const combinedTotals = complete ? mergeTotals(results.map(result => result.totals)) : null;
const combinedLineCoverage = combinedTotals
  ? percent(combinedTotals.linesHit, combinedTotals.linesFound)
  : null;

const markdown = [
  '## Coverage',
  '',
  '| Target | Lines | Functions | Branches |',
  '| --- | ---: | ---: | ---: |',
  ...results.map(result => toRow(result.label, result.totals)),
  toRow('Combined', combinedTotals),
  '',
];

const markdownPath = args.get('--markdown');
if (markdownPath && markdownPath !== true) {
  writeFileSync(markdownPath, markdown.join('\n'), { flag: 'a' });
}

const badgePath = args.get('--badge') || 'badges/coverage.svg';
if (badgePath && badgePath !== true) {
  const message = complete ? formatPercent(combinedLineCoverage) : 'unknown';
  const color = colorForCoverage(combinedLineCoverage);
  mkdirSync(dirname(badgePath), { recursive: true });
  writeFileSync(badgePath, badgeSvg('coverage', message, color));
}

if (!args.has('--quiet')) {
  process.stdout.write(`${markdown.join('\n')}\n`);
}
