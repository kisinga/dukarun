#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(WEB_ROOT, relativePath), 'utf8');
}

const db = source('src/app/pos/offline/offline-db.ts');
const sync = source('src/app/pos/offline/sync.service.ts');
const sell = source('src/app/pos/sell/sell.component.ts');
const cashier = source('src/app/core/cashier-session.service.ts');
const shell = source('src/app/shell/shell.component.ts');
const pos = source('src/app/pos/pos.service.ts');
const authGuard = source('src/app/core/auth.guard.ts');

const checks = [
  {
    ok: /openDB<PosOfflineDb>\('dukarun-pos-offline', 3,/.test(db),
    message: 'IndexedDB schema must remain on the tenant-scoped v3+ migration path.',
  },
  {
    ok: !db.includes('deleteObjectStore('),
    message: 'IndexedDB upgrades must never delete stores containing queued sales.',
  },
  {
    ok: /interface OutboxEntry extends ScopedRecord/.test(db),
    message: 'Outbox records must carry company and user scope.',
  },
  {
    ok: /belongsToIdentity\(e, identity\) && e\.status === 'queued'/.test(sync),
    message: 'Sync must filter queued entries to the active company and user.',
  },
  {
    ok:
      /const clientRef = crypto\.randomUUID\(\)/.test(sell) &&
      /postSale\(customerId, lines, payments, false, clientRef\)/.test(sell) &&
      /queueSale\(customerId, lines, payments, clientRef\)/.test(sell),
    message: 'The first sale attempt and every queued replay must reuse one client reference.',
  },
  {
    ok:
      /snapshot\.session\.company_id === identity\.companyId/.test(cashier) &&
      /this\.nairobiDay\(snapshot\.confirmed_at\) ===/.test(cashier),
    message: 'Cached cashier state must be tenant-scoped and expire at the Nairobi day boundary.',
  },
  {
    ok:
      /if \(this\.pendingSyncCount\(\) > 0\)/.test(shell) &&
      /Sign out with sales waiting\?/.test(shell),
    message: 'Sign-out must warn before leaving tenant-scoped sales pending on the device.',
  },
  {
    ok:
      /async fetchActiveVariants\(\)/.test(pos) &&
      /\.range\(from, from \+ pageSize - 1\)/.test(pos),
    message: 'Offline catalog snapshots must page through the full active catalog.',
  },
  {
    ok: /supabase\.session\.set\(data\.session\)/.test(authGuard),
    message: 'The auth guard must initialize offline identity before routed services restore data.',
  },
];

const failures = checks.filter(check => !check.ok);
if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure.message}`);
  process.exit(1);
}

console.log(`offline-safety-guard: ${checks.length} invariants passed.`);
