/**
 * Audit ledger drift and optionally repair state-only mismatches.
 *
 * Requires the dev server to be running and a superadmin token in the
 * ADMIN_API_TOKEN env var. Default mode is dry-run.
 *
 * Usage:
 *   ADMIN_API_TOKEN=<token> ts-node scripts/audit-ledger-drift.ts
 *   ADMIN_API_TOKEN=<token> ts-node scripts/audit-ledger-drift.ts --repair-state
 */
import http from 'http';
import https from 'https';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:3000/admin-api';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const REPAIR_STATE = process.argv.includes('--repair-state');

const DIVERGENCES_QUERY = `
  query LedgerDivergences($toleranceCents: Int) {
    ledgerDivergences(toleranceCents: $toleranceCents) {
      totalDivergences
      byEntityType { entityType count }
      items {
        entityType
        entityId
        descriptor
        entityValue
        ledgerValue
        difference
      }
    }
  }
`;

const REBUILD_ORDER_MUTATION = `
  mutation RebuildOrder($orderId: ID!, $note: String) {
    rebuildOrderFromLedger(orderId: $orderId, note: $note) {
      orderId
      success
      message
    }
  }
`;

const REBUILD_PURCHASE_MUTATION = `
  mutation RebuildPurchase($purchaseId: ID!) {
    rebuildPurchaseFromLedger(purchaseId: $purchaseId) {
      id
      paymentStatus
    }
  }
`;

function graphqlRequest(query: string, variables?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query, variables });
    const url = new URL(ADMIN_API_URL);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(ADMIN_API_TOKEN ? { Authorization: `Bearer ${ADMIN_API_TOKEN}` } : {}),
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            reject(parsed.errors);
          } else {
            resolve(parsed.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function repairState(entityType: string, entityId: string): Promise<void> {
  if (entityType === 'Order') {
    await graphqlRequest(REBUILD_ORDER_MUTATION, {
      orderId: entityId,
      note: 'audit-ledger-drift repair',
    });
    console.log(`  ✅ Rebuilt order state: ${entityId}`);
  } else if (entityType === 'Purchase') {
    await graphqlRequest(REBUILD_PURCHASE_MUTATION, { purchaseId: entityId });
    console.log(`  ✅ Rebuilt purchase state: ${entityId}`);
  } else {
    console.log(`  ⚠️  Auto-repair not supported for ${entityType}; use override mutations.`);
  }
}

async function main() {
  if (!ADMIN_API_TOKEN) {
    console.error('❌ ADMIN_API_TOKEN is required');
    process.exit(1);
  }

  console.log(`🔍 Fetching ledger divergences from ${ADMIN_API_URL}...`);
  const result = await graphqlRequest(DIVERGENCES_QUERY, { toleranceCents: 0 });
  const summary = result?.ledgerDivergences;

  if (!summary) {
    console.error('❌ No divergence summary returned');
    process.exit(1);
  }

  console.log(`\nTotal divergences: ${summary.totalDivergences}`);
  for (const { entityType, count } of summary.byEntityType || []) {
    console.log(`  ${entityType}: ${count}`);
  }

  for (const item of summary.items || []) {
    console.log(
      `\n${item.entityType} ${item.entityId} (${item.descriptor}): ` +
        `model=${item.entityValue} ledger=${item.ledgerValue} diff=${item.difference}`
    );
    if (REPAIR_STATE) {
      try {
        await repairState(item.entityType, item.entityId);
      } catch (e: any) {
        console.error(`  ❌ Repair failed: ${e.message || JSON.stringify(e)}`);
      }
    }
  }

  console.log(REPAIR_STATE ? '\n✅ Repair pass complete.' : '\n✅ Dry run complete.');
}

if (require.main === module) {
  main().catch(e => {
    console.error('❌ Audit failed:', e.message || JSON.stringify(e));
    process.exit(1);
  });
}
