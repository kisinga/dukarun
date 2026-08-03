#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import stripJsonComments from 'strip-json-comments';

const defaultRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tsconfigPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(defaultRoot, 'tsconfig.json');
const ROOT = path.dirname(tsconfigPath);
const SRC = path.join(ROOT, 'src');
const APP = process.argv[3] ? path.resolve(process.argv[3]) : path.join(SRC, 'app');

const tsconfigRaw = fs.readFileSync(tsconfigPath, 'utf8');
const tsconfig = JSON.parse(stripJsonComments(tsconfigRaw));
const paths = tsconfig.compilerOptions.paths || {};
const aliasMap = {};
for (const [alias, targets] of Object.entries(paths)) {
  const target = targets[0].replace(/^\.\//, '');
  aliasMap[alias] = path.join(ROOT, target);
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function resolveRelative(baseDir, spec) {
  const base = path.resolve(baseDir, spec);
  const candidates = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function resolveAlias(spec) {
  for (const [alias, target] of Object.entries(aliasMap)) {
    // Exact non-wildcard alias (e.g. @dukarun/shell -> src/app/shell/index.ts)
    if (!alias.endsWith('/*')) {
      if (spec === alias) {
        const candidates = [target, target + '.ts', target + '.tsx'];
        for (const c of candidates) if (fs.existsSync(c)) return c;
      }
      if (spec.startsWith(alias + '/')) {
        const rest = spec.slice(alias.length + 1);
        const joined = path.join(path.dirname(target), rest);
        const candidates = [joined, joined + '.ts', joined + '.tsx', path.join(joined, 'index.ts'), path.join(joined, 'index.tsx')];
        for (const c of candidates) if (fs.existsSync(c)) return c;
      }
      continue;
    }

    // Wildcard alias (e.g. @dukarun/* -> src/app/domains/*/index.ts)
    const prefix = alias.slice(0, -1); // keep trailing slash
    if (spec === prefix.slice(0, -1) || spec.startsWith(prefix)) {
      const rest = spec.startsWith(prefix) ? spec.slice(prefix.length) : '';
      const substituted = target.replace(/\*/g, rest);
      const candidates = [substituted, substituted + '.ts', substituted + '.tsx'];
      for (const c of candidates) if (fs.existsSync(c)) return c;
      // If the substituted path is a directory, look for its index.
      const indexCandidates = [path.join(substituted, 'index.ts'), path.join(substituted, 'index.tsx')];
      for (const c of indexCandidates) if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

function layer(p) {
  if (!p) return null;
  const rel = path.relative(APP, p).split(path.sep);
  if (rel[0] === 'shared') return 'shared';
  if (rel[0] === 'domains') return { layer: 'domain', domain: rel[1] };
  if (rel[0] === 'pages') return { layer: 'page', page: rel[1] };
  if (rel[0] === 'shell') return 'shell';
  return 'other';
}

function pageRoot(rel) {
  const segs = rel.split(path.sep);
  if (segs[0] === 'pages' && segs[1]) return path.join(APP, 'pages', segs[1]);
  return null;
}

function* imports(srcText) {
  // Match complete ES import declarations, including multiline ones.
  const re = /\bimport\b(?:\s+type)?\s+(?:(?:[^'"]*?\{[\s\S]*?\}|[^'"]*?\*\s+as\s+\w+|[^'"]*?\w+)\s+from\s+)?(['"])([^'"]+)\1/g;
  let m;
  while ((m = re.exec(srcText)) !== null) {
    yield { spec: m[2], isType: /\bimport\s+type\b/.test(m[0]) };
  }
}

function* dynamicImports(srcText) {
  // Match dynamic import() with a string literal specifier.
  const re = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(srcText)) !== null) {
    yield { spec: m[2], isType: false };
  }
}

const violations = [];

for (const file of walk(APP)) {
  if (!file.endsWith('.ts')) continue;
  if (file.endsWith('.spec.ts')) continue;
  if (file.includes(`${path.sep}testing${path.sep}`)) continue;

  const srcLayer = layer(file);
  if (!srcLayer || srcLayer === 'other') continue;
  const isShared = srcLayer === 'shared';
  const isDomain = typeof srcLayer === 'object' && srcLayer.layer === 'domain';
  const isPage = typeof srcLayer === 'object' && srcLayer.layer === 'page';
  if (!isShared && !isDomain && !isPage) continue;

  const dir = path.dirname(file);
  const srcText = fs.readFileSync(file, 'utf8');
  const lines = srcText.split('\n');
  const lineOf = (pos) => srcText.substring(0, pos).split('\n').length;

  for (const { spec, isType } of [...imports(srcText), ...dynamicImports(srcText)]) {
    if (isType) continue; // erased at runtime, no bundle/layer edge

    const idx = lineOf(srcText.indexOf(spec));

    const targetIs = (targetLayer, layerName) =>
      typeof targetLayer === 'object' ? targetLayer.layer === layerName : targetLayer === layerName;
    const layerName = (targetLayer) => (typeof targetLayer === 'object' ? targetLayer.layer : targetLayer);

    if (spec.startsWith('.')) {
      const resolved = resolveRelative(dir, spec);
      if (!resolved) continue;
      const targetLayer = layer(resolved);
      if (!targetLayer || targetLayer === 'other') continue;

      if (isShared) {
        if (targetIs(targetLayer, 'domain') || targetIs(targetLayer, 'page') || targetIs(targetLayer, 'shell')) {
          violations.push(`${path.relative(ROOT, file)}:${idx} shared -> ${layerName(targetLayer)} '${spec}'`);
        }
      } else if (isDomain) {
        if (targetIs(targetLayer, 'page') || targetIs(targetLayer, 'shell')) {
          violations.push(`${path.relative(ROOT, file)}:${idx} domain -> ${layerName(targetLayer)} '${spec}'`);
        }
        // also flag relative cross-domain imports (task says use aliases)
        if (targetIs(targetLayer, 'domain') && targetLayer.domain !== srcLayer.domain) {
          violations.push(`${path.relative(ROOT, file)}:${idx} domain relative cross-import -> ${targetLayer.domain} '${spec}'`);
        }
      } else if (isPage) {
        if (targetIs(targetLayer, 'page')) {
          const importerRoot = pageRoot(path.relative(APP, file));
          if (importerRoot && !resolved.startsWith(importerRoot + path.sep)) {
            violations.push(`${path.relative(ROOT, file)}:${idx} page -> other page '${spec}'`);
          }
        }
      }
    } else if (spec.startsWith('@dukarun/')) {
      const resolved = resolveAlias(spec);
      if (!resolved) continue;
      const targetLayer = layer(resolved);

      if (isShared) {
        if (targetIs(targetLayer, 'domain') || targetIs(targetLayer, 'shell')) {
          violations.push(`${path.relative(ROOT, file)}:${idx} shared -> ${layerName(targetLayer)} alias '${spec}'`);
        }
      } else if (isDomain) {
        if (targetIs(targetLayer, 'shell')) {
          violations.push(`${path.relative(ROOT, file)}:${idx} domain -> shell alias '${spec}'`);
        }
        // Ban self-imports through the domain barrel.
        if (targetIs(targetLayer, 'domain') && targetLayer.domain === srcLayer.domain) {
          violations.push(`${path.relative(ROOT, file)}:${idx} domain self-import -> '${spec}'`);
        }
      }

      // Secondary component entry points should only be imported from pages
      // or other components, never from services/guards/shared code.
      if (/^@dukarun\/[^/]+\/components/.test(spec)) {
        const importerRel = path.relative(APP, file).split(path.sep);
        const importerIsPage = importerRel[0] === 'pages';
        const importerIsComponent = importerRel[0] === 'domains' && importerRel[2] === 'components';
        if (!importerIsPage && !importerIsComponent) {
          violations.push(`${path.relative(ROOT, file)}:${idx} non-page/non-component imports component alias '${spec}'`);
        }
      }
    }
  }
}

console.log(`violations: ${violations.length}`);
if (violations.length) {
  for (const v of violations) console.log('  ' + v);
  process.exit(1);
}
