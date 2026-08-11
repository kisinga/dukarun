#!/usr/bin/env node
/**
 * design-guard — CI/lint-staged gate for "The Counter" design language
 * (see docs/DESIGN_SYSTEM.md).
 *
 * Usage:
 *   node scripts/design-guard.mjs            # scan all of src/app
 *   node scripts/design-guard.mjs <files...> # scan specific files (lint-staged)
 *   node scripts/design-guard.mjs --seed     # rewrite the allowlist with current counts
 *
 * Ratchet: design-guard.allowlist.json stores the KNOWN violation count per
 * rule per file. A file may shrink its count (please delete the stale entry)
 * but never grow it — growth fails the check. New files have an implicit
 * allowance of 0, so new violations fail immediately.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEBROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(WEBROOT, 'src', 'app');
const ALLOWLIST_PATH = path.join(WEBROOT, 'scripts', 'design-guard.allowlist.json');

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|✓|✔|✕|✖|▼|▶|▲|◀/u;

const RULES = [
  {
    id: 'inline-svg',
    exts: ['.html', '.ts'],
    re: /<svg[\s>]/g,
    message:
      'Inline <svg> is banned — use <app-icon name="hero…"> (registry: provideIcons in app.config.ts).',
  },
  {
    id: 'arbitrary-text-size',
    exts: ['.html', '.ts'],
    re: /text-\[\d+(?:\.\d+)?(?:px|rem)\]/g,
    message:
      'Arbitrary text-[Npx]/[Nrem] sizes are banned — use the type roles (type-hero/type-title/type-heading/type-body/type-caption) or text-xs.',
  },
  {
    id: 'oversize-dashboard-text',
    exts: ['.html', '.ts'],
    re: /text-(?:3xl|4xl|5xl|6xl|7xl|8xl|9xl)/g,
    message:
      'Dashboard text never exceeds text-2xl (24px) — use type-hero for numbers, type-title for page titles.',
  },
  {
    id: 'heavy-shadow',
    exts: ['.html', '.ts'],
    re: /shadow-(?:lg|xl|2xl)(?![\w-])/g,
    message:
      'shadow-lg/xl/2xl are reserved for overlays — use shadow-overlay; cards get their shadow from the global .card recipe.',
  },
  {
    id: 'emoji',
    exts: ['.html', '.ts'],
    re: EMOJI_RE,
    message: 'No emoji/text glyphs in UI — use <app-icon> (heroicons).',
  },
  {
    id: 'off-scale-icon-size',
    exts: ['.html', '.ts'],
    // ng-icon size="…" outside the sanctioned scale (14/16/20/40px)
    re: /size="(?!0\.875rem"|1rem"|1\.25rem"|2\.5rem")[\d.]+(?:rem|em|px)"/g,
    message:
      'Icon sizes are 0.875rem (sm), 1rem (md), 1.25rem (lg), 2.5rem (xl decorative) — use <app-icon size="…">.',
  },
  {
    id: 'hand-built-status-dot',
    exts: ['.html', '.ts'],
    re: /<span[^>]*class="(?=[^"]*\bh-2\b)(?=[^"]*\bw-2\b)(?=[^"]*\brounded-full\b)[^"]*"[^>]*>\s*<\/span>/g,
    message:
      'Hand-built status dots are banned — use a registered semantic Heroicon through <app-icon>.',
  },
  {
    id: 'page-shell-bypass',
    exts: ['.ts'],
    re: /<main class="dashboard-main min-h-screen bg-base-200 p-4">/g,
    exclude: ['shared/ui/page-layout.component.ts'],
    message:
      'Routed dashboard pages must use <app-page>; only PageLayoutComponent owns dashboard-main and .page.',
  },
  {
    id: 'direct-page-header',
    exts: ['.ts'],
    re: /<app-page-header[\s>]/g,
    exclude: ['shared/ui/page-layout.component.ts'],
    message:
      'Pages must pass title/subtitle/actions through <app-page>, not render PageHeaderComponent directly.',
  },
  {
    id: 'unbounded-entity-select',
    exts: ['.html', '.ts'],
    re: /<select\b(?:(?!<\/select>)[\s\S])*@for\s*\([^)]*\bof\s+(?:suppliers|manufacturers|customers|products)\s*\(\)(?:(?!<\/select>)[\s\S])*<\/select>/g,
    message:
      'Potentially unbounded party/catalog lists must use <app-searchable-filter> or server typeahead; native selects are only for small bounded enumerations.',
  },
  {
    id: 'page-width-override',
    exts: ['.ts'],
    re: /class="mx-auto max-w-(?:sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b/g,
    message:
      'Do not center a second max-width wrapper inside a page; use <app-page> or [wide]="true".',
  },
  {
    id: 'manual-list-toolbar-spacing',
    exts: ['.ts'],
    re: /<app-list-search-bar[^>]*class="[^"]*\b(?:m[trblxy]?|space-y)-/g,
    exclude: ['shared/ui/list-search-bar.component.ts'],
    message:
      'ListSearchBar owns its block layout, padding, and bottom rhythm — do not add page-level spacing classes to it.',
  },
  {
    id: 'visible-refresh-label',
    exts: ['.ts'],
    re: /<button\b[^>]*>\s*(?:<app-icon[^>]*\/>\s*)?Refresh\s*<\/button>/g,
    message:
      'Refresh controls are ghost icon-only actions with title/aria-label and loading state — do not render a visible Refresh label.',
  },
  {
    id: 'pagination-inside-table-shell',
    exts: ['.ts'],
    re: /<app-pagination\b[^>]*\btableFooter\b/g,
    message:
      'Primary list pagination sits outside DataTableShell with mt-3 so desktop tables and mobile cards share one rhythm.',
  },
  {
    id: 'hardcoded-hex',
    exts: ['.scss', '.css'],
    re: /#[0-9a-fA-F]{3,8}\b/g,
    message: 'No hardcoded hex in component styles — use daisyUI tokens (var(--color-*)).',
  },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function loadAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function countMatches(content, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const m = content.match(new RegExp(re.source, flags));
  return m ? m.length : 0;
}

const args = process.argv.slice(2);
const seed = args.includes('--seed');
const fileArgs = args.filter(a => a !== '--seed');

let files;
if (fileArgs.length > 0) {
  files = fileArgs
    .map(f => {
      const resolved = path.resolve(process.cwd(), f);
      if (fs.existsSync(resolved)) return resolved;
      // lint-staged passes repo-root-relative paths like "apps/web/src/..."
      const stripped = path.resolve(WEBROOT, f.replace(/^apps[/\\]web[/\\]/, ''));
      return fs.existsSync(stripped) ? stripped : null;
    })
    .filter(Boolean);
} else {
  files = [...walk(APP)];
}
files = files.filter(f => f.startsWith(APP));

const allowlist = loadAllowlist();
const newAllowlist = {};
let failures = 0;
const notes = [];

for (const rule of RULES) {
  newAllowlist[rule.id] = {};
  for (const file of files) {
    if (!rule.exts.includes(path.extname(file))) continue;
    const rel = path.relative(APP, file);
    if (rule.exclude?.includes(rel)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const count = countMatches(content, rule.re);
    if (count === 0) continue;

    if (seed) {
      newAllowlist[rule.id][rel] = count;
      continue;
    }

    const allowed = allowlist[rule.id]?.[rel] ?? 0;
    if (count > allowed) {
      failures++;
      console.error(
        `✖ [${rule.id}] ${rel}: ${count} violation(s) (allowed ${allowed})\n    ${rule.message}`
      );
    } else {
      newAllowlist[rule.id][rel] = count;
      if (count < allowed) {
        notes.push(
          `↓ [${rule.id}] ${rel}: ${allowed} → ${count} — shrink the allowlist entry (or run --seed).`
        );
      }
    }
  }
}

if (seed) {
  // Merge: keep existing entries only for files NOT scanned in this run
  // (scanned files with zero matches are dropped — the allowlist must shrink).
  const scanned = new Set(files.map(f => path.relative(APP, f)));
  for (const [ruleId, entries] of Object.entries(allowlist)) {
    if (!newAllowlist[ruleId]) newAllowlist[ruleId] = {};
    for (const [rel, count] of Object.entries(entries)) {
      if (!(rel in newAllowlist[ruleId]) && !scanned.has(rel)) newAllowlist[ruleId][rel] = count;
    }
  }
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(newAllowlist, null, 2) + '\n');
  const total = Object.values(newAllowlist).reduce((n, e) => n + Object.keys(e).length, 0);
  console.log(
    `design-guard: allowlist seeded (${total} entries across ${Object.keys(newAllowlist).length} rules).`
  );
  process.exit(0);
}

for (const n of notes) console.log(n);

// Heroicons fail silently when a literal name is used without being added to
// the global registry. Keep the check outside the ratchet: every icon name in
// touched templates/code must be registered, with no legacy allowance.
if (!seed) {
  const configPath = path.join(APP, 'app.config.ts');
  const config = fs.readFileSync(configPath, 'utf8');
  const registryBody = config.match(/provideIcons\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
  const registered = new Set(registryBody.match(/hero[A-Z][A-Za-z0-9]*/g) ?? []);
  const missingByFile = new Map();
  for (const file of files) {
    if (!['.html', '.ts'].includes(path.extname(file)) || file === configPath) continue;
    const content = fs.readFileSync(file, 'utf8');
    const names = [...content.matchAll(/['"](hero[A-Z][A-Za-z0-9]*)['"]/g)].map(match => match[1]);
    const missing = [...new Set(names.filter(name => !registered.has(name)))];
    if (missing.length > 0) missingByFile.set(path.relative(APP, file), missing);
  }
  for (const [file, names] of missingByFile) {
    failures++;
    console.error(
      `✖ [unregistered-icon] ${file}: ${names.join(', ')}\n    Register every Heroicon in provideIcons({ … }) in app.config.ts.`
    );
  }
}

if (failures > 0) {
  console.error(
    `\ndesign-guard: ${failures} file(s) violate The Counter rules. See docs/DESIGN_SYSTEM.md.`
  );
  process.exit(1);
}
console.log('design-guard: clean.');
