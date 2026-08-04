#!/usr/bin/env node
// setup.mjs — v2 setup & healthcheck (ported from the v1 developer-tools pattern).
//
// First-time setup and anytime diagnosis:
//   node scripts/setup.mjs            # full check
//   node scripts/setup.mjs --fix      # auto-fix what's safely fixable
//   node scripts/setup.mjs --quick    # skip slow checks (API calls)
//
// Checks: node version, docker, supabase CLI + local stack (incl. Studio),
// app deps, generated env files, deploy config.

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const FIX = process.argv.includes('--fix');
const QUICK = process.argv.includes('--quick');

const c = { r: '\x1b[0m', red: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[34m' };
const ok = m => console.log(`${c.g}✓${c.r} ${m}`);
const warn = m => console.log(`${c.y}⚠${c.r} ${m}`);
const bad = m => {
  console.log(`${c.red}✗${c.r} ${m}`);
  failures++;
};
const step = m => console.log(`\n${c.b}▶${c.r} ${m}`);
let failures = 0;

const run = cmd => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};
const http = async url => {
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    return r.status;
  } catch {
    return null;
  }
};

step('Node.js (need >= 22.22.1)');
const nodeV = process.versions.node;
const [maj, min] = nodeV.split('.').map(Number);
maj > 22 || (maj === 22 && min >= 22) ? ok(`node ${nodeV}`) : bad(`node ${nodeV} too old`);

step('Docker');
const dockerV = run('docker version --format "{{.Server.Version}}"');
dockerV ? ok(`docker server ${dockerV}`) : bad('docker not running — start Docker Desktop');

step('Supabase CLI + local stack');
const sbV = run('npx supabase --version');
sbV ? ok(`supabase CLI ${sbV}`) : bad('supabase CLI missing (npm i)');
if (!QUICK) {
  const api = await http('http://127.0.0.1:54321/rest/v1/');
  if (api) ok(`local API responding (http ${api})`);
  else {
    warn('local stack not running');
    if (FIX) {
      console.log('  → npm run sb:start');
      spawnSync('npx', ['supabase', 'start'], { stdio: 'inherit' });
    } else console.log('  hint: npm run sb:start');
  }
  const studio = await http('http://127.0.0.1:54323');
  studio
    ? ok(`Studio responding on 54323 (http ${studio})`)
    : warn('Studio not responding — is the stack up?');
}

step('App dependencies');
for (const app of ['web', 'storefront', 'super-admin']) {
  fs.existsSync(`apps/${app}/node_modules`) || fs.existsSync('node_modules')
    ? ok(`apps/${app} deps`)
    : warn(`apps/${app} deps missing${FIX ? '' : ' — npm i'}`);
}
if (FIX && !fs.existsSync('node_modules')) spawnSync('npm', ['install'], { stdio: 'inherit' });

step('Generated app env files');
for (const app of ['web', 'storefront', 'super-admin']) {
  const f = `apps/${app}/src/environments/environment.generated.ts`;
  if (fs.existsSync(f)) ok(f);
  else if (FIX) {
    spawnSync('node', ['scripts/generate-environment.mjs', app], { stdio: 'inherit' });
  } else
    warn(`${f} missing — generated at build, or: node scripts/generate-environment.mjs ${app}`);
}

step('Deploy config (.env.deploy)');
if (fs.existsSync('.env.deploy')) {
  const txt = fs.readFileSync('.env.deploy', 'utf8');
  const hasHost = /^DEPLOY_SSH_HOST=.+/m.test(txt);
  const hasDir = /^COOLIFY_SERVICE_DIR=.+/m.test(txt);
  hasHost && hasDir
    ? ok('.env.deploy configured')
    : bad('.env.deploy incomplete — see .env.deploy.example');
} else {
  warn('.env.deploy missing (only needed for deploys) — cp .env.deploy.example .env.deploy');
}

console.log('');
if (failures) {
  console.log(`${c.red}${failures} check(s) failed${c.r}`);
  process.exit(1);
}
console.log(
  `${c.g}All good.${c.r} Daily drivers: npm run sb:start · npm run dev (or dev:all) · npm run sb:studio`
);
