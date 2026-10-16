#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ports = { web: 8443, site: 8444, storefront: 8445, 'super-admin': 8446, api: 8447 };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (exit ${result.status}).`);
  return result.stdout;
}
const capture = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };

try {
  const status = JSON.parse(run('tailscale', ['status', '--json'], capture));
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (status.BackendState !== 'Running' || !hostname)
    throw new Error('Connect this machine to Tailscale first.');
  if (!status.CurrentTailnet?.MagicDNSEnabled || !status.CertDomains?.includes(hostname)) {
    throw new Error(
      'Enable MagicDNS and HTTPS certificates in the Tailscale admin DNS settings first.'
    );
  }
  const url = app => `https://${hostname}:${ports[app]}`;
  const targets = {};
  for (const app of Object.keys(ports).filter(app => app !== 'api')) {
    const config = JSON.parse(
      readFileSync(new URL(`../apps/${app}/angular.json`, import.meta.url))
    );
    targets[app] =
      `http://127.0.0.1:${config.projects[app].architect.serve.configurations.tailscale.port}`;
  }
  targets.api = 'http://127.0.0.1:54321';
  const existing = JSON.parse(run('tailscale', ['serve', 'status', '--json'], capture));
  // Never replace a port that is already serving something else on this machine.
  for (const [app, port] of Object.entries(ports)) {
    if (existing.TCP?.[port]) {
      const handlers = existing.Web?.[`${hostname}:${port}`]?.Handlers;
      if (!existing.TCP[port].HTTPS || handlers?.['/']?.Proxy !== targets[app]) {
        throw new Error(`Tailscale HTTPS port ${port} is already in use by another service.`);
      }
    }
  }
  run('docker', ['info'], { stdio: 'ignore' });
  // Supabase can print server-only keys on stdout; do not echo them.
  run('supabase', ['start'], capture);
  const backend = JSON.parse(run('supabase', ['status', '--output', 'json'], capture));
  if (backend.API_URL !== targets.api || !backend.ANON_KEY) {
    throw new Error('Expected local Supabase on http://127.0.0.1:54321 with a public anon key.');
  }
  const env = {
    ...process.env,
    DUKARUN_TAILSCALE_DEV: '1',
    SUPABASE_URL: url('api'),
    SUPABASE_ANON_KEY: backend.ANON_KEY,
    SITE_PUBLIC_URL: url('site'),
    APP_PUBLIC_URL: url('web'),
    STOREFRONT_PUBLIC_URL: url('storefront'),
    PUBLIC_DATA_MODE: 'live',
  };
  for (const app of Object.keys(targets).filter(app => app !== 'api')) {
    run(process.execPath, ['scripts/generate-environment.mjs', app], { env });
  }
  for (const [app, port] of Object.entries(ports)) {
    run('tailscale', ['serve', '--bg', '--yes', `--https=${port}`, targets[app]]);
  }
  console.log('\nConnect your test devices to Tailscale, then open:');
  for (const app of Object.keys(ports)) console.log(`  ${app}: ${url(app)}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
