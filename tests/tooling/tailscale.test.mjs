import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dukarun-tailscale-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'bin'));
  for (const name of ['prepare-tailscale.mjs', 'generate-environment.mjs']) {
    copyFileSync(new URL(`../../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  for (const app of ['site', 'web', 'storefront', 'super-admin']) {
    mkdirSync(join(root, 'apps', app), { recursive: true });
    copyFileSync(
      new URL(`../../apps/${app}/angular.json`, import.meta.url),
      join(root, 'apps', app, 'angular.json')
    );
  }
  const stub = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.TEST_LOG, JSON.stringify([command, ...args]) + String.fromCharCode(10));
if (command === 'tailscale' && args[0] === 'status') console.log(process.env.TEST_TAILSCALE);
if (command === 'tailscale' && args[0] === 'serve' && args[1] === 'status') console.log(process.env.TEST_SERVE || '{}');
if (command === 'supabase') console.log(JSON.stringify({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'public-key', SERVICE_ROLE_KEY: 'private-key' }));
`;
  for (const command of ['tailscale', 'supabase', 'docker']) {
    writeFileSync(join(root, 'bin', command), stub, { mode: 0o755 });
  }
  const env = {
    ...process.env,
    PATH: join(root, 'bin') + delimiter + process.env.PATH,
    TEST_LOG: join(root, 'commands.log'),
    TEST_TAILSCALE: JSON.stringify({
      BackendState: 'Running',
      Self: { DNSName: 'test.tail-example.ts.net.' },
      CurrentTailnet: { MagicDNSEnabled: true },
      CertDomains: ['test.tail-example.ts.net'],
    }),
  };
  return {
    root,
    run: overrides =>
      spawnSync(process.execPath, ['scripts/prepare-tailscale.mjs'], {
        cwd: root,
        env: { ...env, ...overrides },
        encoding: 'utf8',
      }),
    calls: () => readFileSync(env.TEST_LOG, 'utf8').trim().split('\n').map(JSON.parse),
  };
}

test('generates private HTTPS URLs and keeps production files and server keys separate', t => {
  const fixtureState = fixture(t);
  const production = join(fixtureState.root, 'apps/web/src/environments/environment.generated.ts');
  mkdirSync(join(fixtureState.root, 'apps/web/src/environments'), { recursive: true });
  writeFileSync(production, 'production configuration');
  const result = fixtureState.run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('private-key'));
  assert.equal(readFileSync(production, 'utf8'), 'production configuration');
  for (const app of ['site', 'web', 'storefront', 'super-admin']) {
    const generated = readFileSync(
      join(fixtureState.root, 'apps', app, 'src/environments/environment.tailscale.generated.ts'),
      'utf8'
    );
    assert.match(generated, /production: false/);
    assert.match(generated, /https:\/\/test.tail-example.ts.net:8447/);
    assert.match(generated, /appPublicUrl: "https:\/\/test.tail-example.ts.net:8443"/);
    assert.match(generated, /publicDataMode: "live"/);
    assert.ok(!generated.includes('private-key'));
  }
  assert.equal(fixtureState.calls().filter(call => call.includes('--bg')).length, 5);
});

test('refuses to overwrite unrelated Tailscale services before starting the backend', t => {
  const fixtureState = fixture(t);
  const result = fixtureState.run({
    TEST_SERVE: JSON.stringify({
      TCP: { 8443: { HTTPS: true } },
      Web: {
        'test.tail-example.ts.net:8443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } },
      },
    }),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already in use/);
  assert.ok(!fixtureState.calls().some(call => call[0] === 'supabase' || call.includes('--bg')));
});

test('disconnected Tailscale fails before changing any Serve configuration', t => {
  const fixtureState = fixture(t);
  const result = fixtureState.run({ TEST_TAILSCALE: JSON.stringify({ BackendState: 'Stopped' }) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Connect this machine/);
  assert.equal(fixtureState.calls().length, 1);
});
