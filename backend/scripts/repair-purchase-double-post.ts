#!/usr/bin/env ts-node
/**
 * Repair purchases that were double-posted to the ledger.
 *
 * Between ~2025-11 (valuation-enabled channels) and the single-posting fix, every
 * confirmed purchase posted TWO journal entries:
 *   - sourceType 'SupplierPurchase'  (DR PURCHASES / CR AP|CASH_ON_HAND)
 *   - sourceType 'InventoryPurchase' (DR INVENTORY / CR AP|CASH_ON_HAND)
 * Both credit AP (or CASH_ON_HAND), so AP/cash and PURCHASES were double-counted.
 *
 * For each affected purchase this script posts ONE balanced reversal entry that
 * neutralizes the legacy 'SupplierPurchase' entry:
 *   DR AP|CASH_ON_HAND / CR PURCHASES   (sourceType 'BalanceAdjustment',
 *   sourceId 'repair-double-post-<purchaseId>')
 * The AP/cash debit line carries meta.purchaseId / meta.supplierId so per-purchase
 * and per-supplier balance queries return to sync (LedgerConsistencyGuard compares
 * amountOwing). The reversal is backdated to the original entry's entryDate so
 * historical period reports are corrected too.
 *
 * Idempotent: the (channelId, sourceType, sourceId) unique constraint plus an
 * explicit existence check make re-runs safe.
 *
 * Default mode is dry-run. Usage:
 *   npx ts-node scripts/repair-purchase-double-post.ts            # dry-run report
 *   npx ts-node scripts/repair-purchase-double-post.ts --apply    # write reversals
 */
import { DataSource } from 'typeorm';
import { EnvironmentConfig } from '../src/infrastructure/config/environment.config';

const env = EnvironmentConfig.getInstance();
const APPLY = process.argv.includes('--apply');

const ds = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.name,
  schema: env.db.schema,
});

interface DoubledPurchase {
  channelId: number;
  purchaseId: string;
  entryDate: string;
  amount: string; // PURCHASES debit from the SupplierPurchase entry
  creditAccountCode: string; // ACCOUNTS_PAYABLE or CASH_ON_HAND
  supplierId: string | null;
  inventoryAmount: string; // INVENTORY debit from the InventoryPurchase entry
}

async function findDoubledPurchases(): Promise<DoubledPurchase[]> {
  return ds.query(`
    SELECT
      sp."channelId"                                  AS "channelId",
      sp."sourceId"                                   AS "purchaseId",
      sp."entryDate"                                  AS "entryDate",
      purchases_line."debit"                          AS "amount",
      credit_account."code"                           AS "creditAccountCode",
      purchases_line."meta"->>'supplierId'            AS "supplierId",
      inventory_line."debit"                          AS "inventoryAmount"
    FROM ledger_journal_entry sp
    JOIN ledger_journal_entry ip
      ON ip."channelId" = sp."channelId"
     AND ip."sourceType" = 'InventoryPurchase'
     AND ip."sourceId" = sp."sourceId"
    JOIN ledger_journal_line purchases_line
      ON purchases_line."entryId" = sp."id"
    JOIN ledger_account purchases_account
      ON purchases_account."id" = purchases_line."accountId"
     AND purchases_account."code" = 'PURCHASES'
    JOIN ledger_journal_line credit_line
      ON credit_line."entryId" = sp."id"
     AND CAST(credit_line."credit" AS BIGINT) > 0
    JOIN ledger_account credit_account
      ON credit_account."id" = credit_line."accountId"
     AND credit_account."code" IN ('ACCOUNTS_PAYABLE', 'CASH_ON_HAND')
    JOIN ledger_journal_line inventory_line
      ON inventory_line."entryId" = ip."id"
    JOIN ledger_account inventory_account
      ON inventory_account."id" = inventory_line."accountId"
     AND inventory_account."code" = 'INVENTORY'
    WHERE sp."sourceType" = 'SupplierPurchase'
      AND CAST(purchases_line."debit" AS BIGINT) > 0
      -- Skip purchases already repaired by this script or already reconciled via
      -- reconcilePurchase(strategy 'order'), which posts its own AP adjustment.
      AND NOT EXISTS (
        SELECT 1 FROM ledger_journal_entry repair
        WHERE repair."channelId" = sp."channelId"
          AND repair."sourceType" = 'BalanceAdjustment'
          AND repair."sourceId" IN (
            'repair-double-post-' || sp."sourceId",
            'purchase-reconciliation-' || sp."sourceId"
          )
      )
    ORDER BY sp."channelId", sp."entryDate";
  `);
}

const accountIdCache = new Map<string, string>();

async function getAccountId(channelId: number, code: string): Promise<string> {
  const key = `${channelId}:${code}`;
  const cached = accountIdCache.get(key);
  if (cached) {
    return cached;
  }
  const rows = await ds.query(
    `SELECT "id" FROM ledger_account WHERE "channelId" = $1 AND "code" = $2`,
    [channelId, code]
  );
  if (rows.length === 0) {
    throw new Error(`Account ${code} not found for channel ${channelId}`);
  }
  accountIdCache.set(key, rows[0].id);
  return rows[0].id;
}

async function repair() {
  await ds.initialize();
  const doubled = await findDoubledPurchases();

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Found ${doubled.length} double-posted purchase(s) without a repair entry.\n`);

  let repaired = 0;
  let skipped = 0;

  for (const row of doubled) {
    const amount = parseInt(row.amount, 10);
    const inventoryAmount = parseInt(row.inventoryAmount, 10);
    const prefix = `[channel ${row.channelId}] purchase ${row.purchaseId}`;

    if (amount !== inventoryAmount) {
      console.log(
        `SKIP ${prefix}: SupplierPurchase amount ${amount} != InventoryPurchase amount ${inventoryAmount}. Investigate manually.`
      );
      skipped++;
      continue;
    }

    console.log(
      `${APPLY ? 'REPAIR' : 'WOULD REPAIR'} ${prefix}: reverse ${amount} ` +
        `(DR ${row.creditAccountCode} / CR PURCHASES, entryDate ${row.entryDate})`
    );

    if (APPLY) {
      const debitAccountId = await getAccountId(row.channelId, row.creditAccountCode);
      const purchasesAccountId = await getAccountId(row.channelId, 'PURCHASES');
      const sourceId = `repair-double-post-${row.purchaseId}`;
      const meta = JSON.stringify({
        purchaseId: row.purchaseId,
        supplierId: row.supplierId,
        reason: 'Repair double-posted purchase: neutralize legacy SupplierPurchase entry',
      });
      const memo = `Repair double-posted purchase ${row.purchaseId}`;

      await ds.transaction(async manager => {
        const entryRows = await manager.query(
          `INSERT INTO ledger_journal_entry
             ("channelId", "entryDate", "sourceType", "sourceId", "status", "memo")
           VALUES ($1, $2, 'BalanceAdjustment', $3, 'posted', $4)
           RETURNING "id"`,
          [row.channelId, row.entryDate, sourceId, memo]
        );
        const entryId = entryRows[0].id;

        await manager.query(
          `INSERT INTO ledger_journal_line
             ("entryId", "accountId", "channelId", "debit", "credit", "meta")
           VALUES
             ($1, $2, $3, $4, 0, $5::jsonb),
             ($1, $6, $3, 0, $4, $5::jsonb)`,
          [entryId, debitAccountId, row.channelId, amount, meta, purchasesAccountId]
        );
      });
      repaired++;
    }
  }

  console.log(
    `\nDone. ${APPLY ? `Repaired ${repaired}.` : `Dry-run only — re-run with --apply.`}` +
      (skipped ? ` Skipped ${skipped} (amount mismatch).` : '')
  );

  if (APPLY && repaired > 0) {
    console.log(
      'Next: verify with `ADMIN_API_TOKEN=<token> npx ts-node scripts/audit-ledger-drift.ts`.'
    );
  }

  await ds.destroy();
}

repair().catch(err => {
  console.error(err);
  process.exit(1);
});
