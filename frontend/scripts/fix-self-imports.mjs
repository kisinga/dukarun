#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOMAINS = path.join(ROOT, 'src', 'app', 'domains');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function relativePath(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/').replace(/\.ts$/, '');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function buildExportMap() {
  const map = {};
  for (const dir of fs.readdirSync(DOMAINS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const domain = dir.name;
    const indexPath = path.join(DOMAINS, domain, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;
    const indexText = fs.readFileSync(indexPath, 'utf8');
    const exports = {};
    for (const line of indexText.split('\n')) {
      const m = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      const source = m[1].replace(/^\.\//, '');
      const sourcePath = path.join(DOMAINS, domain, source + '.ts');
      if (!fs.existsSync(sourcePath)) continue;
      const sourceText = fs.readFileSync(sourcePath, 'utf8');
      // Extract named exports (export const X, export function X, export class X, export { X })
      const namedRe = /(?:^|\n)\s*export\s+(?:(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)|\{([^}]+)\})/g;
      let nm;
      while ((nm = namedRe.exec(sourceText)) !== null) {
        if (nm[1]) {
          exports[nm[1]] = source;
        } else if (nm[2]) {
          for (const name of nm[2].split(',')) {
            const clean = name.trim().split(/\s+as\s+/).pop().trim();
            if (clean) exports[clean] = source;
          }
        }
      }
    }
    map[domain] = exports;
  }
  return map;
}

const exportMap = buildExportMap();

function* imports(srcText) {
  const re = /\bimport\b(?:\s+type)?\s+(?:(?:[^'"]*?\{[\s\S]*?\}|[^'"]*?\*\s+as\s+\w+|[^'"]*?\w+)\s+from\s+)?(['"])([^'"]+)\1/g;
  let m;
  while ((m = re.exec(srcText)) !== null) {
    yield { full: m[0], spec: m[2], start: m.index, end: m.index + m[0].length };
  }
}

function parseNamedImports(full) {
  const m = full.match(/\{([\s\S]*?)\}\s+from/);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const isType = s.startsWith('type ');
    const bare = isType ? s.slice(5).trim() : s;
    const parts = bare.split(/\s+as\s+/);
    return { binding: parts[0].trim(), alias: parts[1]?.trim(), isType };
  });
}

for (const file of walk(DOMAINS)) {
  if (!file.endsWith('.ts')) continue;
  const rel = path.relative(DOMAINS, file).replace(/\\/g, '/');
  const domain = rel.split('/')[0];
  const exportsForDomain = exportMap[domain];
  if (!exportsForDomain) continue;

  const text = fs.readFileSync(file, 'utf8');
  const matches = [];
  for (const imp of imports(text)) {
    if (!imp.spec.startsWith(`@dukarun/${domain}`)) continue;
    if (imp.spec !== `@dukarun/${domain}` && !imp.spec.startsWith(`@dukarun/${domain}/`)) continue;
    const names = parseNamedImports(imp.full);
    if (!names) continue;
    matches.push({ start: imp.start, end: imp.end, names });
  }

  if (matches.length === 0) continue;

  let newText = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, names } = matches[i];
    const bySource = {};
    for (const { binding, alias, isType } of names) {
      const source = exportsForDomain[binding];
      if (!source) {
        console.error(`Unknown export ${binding} from @dukarun/${domain} in ${rel}`);
        process.exit(1);
      }
      if (!bySource[source]) bySource[source] = { bindings: [], typeBindings: [] };
      const entry = isType ? bySource[source].typeBindings : bySource[source].bindings;
      entry.push(alias ? `${binding} as ${alias}` : binding);
    }

    const importLines = Object.entries(bySource).flatMap(([source, { bindings, typeBindings }]) => {
      const relPath = relativePath(file, path.join(DOMAINS, domain, source + '.ts'));
      const lines = [];
      if (bindings.length) {
        lines.push(`import { ${bindings.join(', ')} } from '${relPath}';`);
      }
      if (typeBindings.length) {
        lines.push(`import { type ${typeBindings.join(', type ')} } from '${relPath}';`);
      }
      return lines;
    });

    newText = newText.slice(0, start) + importLines.join('\n') + newText.slice(end);
  }

  fs.writeFileSync(file, newText, 'utf8');
  console.log(`fixed ${rel}`);
}
