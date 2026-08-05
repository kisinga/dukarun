// VERIFY: per-company migration report, source (Vendure) vs target (Supabase).
// Usage: node scripts/etl/verify.mjs --channel <id>
// Read-only on both sides. Exits non-zero if any hard check fails.
import pg from 'pg';

const SRC_DSN =
  process.env.SOURCE_DB_URL ?? 'postgres://vendure:changeme-secure-password@localhost:5432/vendure';
const TGT_DSN =
  process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));
pg.types.setTypeParser(701, v => (v === null ? null : Number(v)));

const args = process.argv.slice(2);
const ci = args.indexOf('--channel');
if (ci === -1) {
  console.error('usage: node scripts/etl/verify.mjs --channel <id>');
  process.exit(1);
}
const CHANNEL_ID = Number(args[ci + 1]);

const src = new pg.Client(SRC_DSN);
const tgt = new pg.Client(TGT_DSN);
await src.connect();
await tgt.connect();
const S = (q, p) => src.query(q, p).then(r => r.rows);
const T = (q, p) => tgt.query(q, p).then(r => r.rows);

let failures = 0;
const notes = [];
const warnLines = [];
const ok = (label, pass, detail = '') => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) failures++;
};

const chan = (await S('select * from channel where id=$1', [CHANNEL_ID]))[0];
if (!chan) {
  console.error(`channel ${CHANNEL_ID} not found`);
  process.exit(1);
}
const mapRow = await T(
  `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`,
  [String(CHANNEL_ID)]
);
if (!mapRow.length) {
  console.error(`channel ${CHANNEL_ID} not migrated (no etl_id_map entry)`);
  process.exit(1);
}
const companyId = mapRow[0].new_id;
const company = (await T('select * from public.companies where id=$1', [companyId]))[0];

console.log(
  `\n=== VERIFY channel ${CHANNEL_ID} (${chan.code}) -> company ${companyId} (${company.name}) ===`
);

const idMap = await T(
  'select old_type, old_id, new_id from public.etl_id_map where company_id=$1',
  [companyId]
);
const maps = {};
for (const r of idMap) (maps[r.old_type] ??= new Map()).set(r.old_id, r.new_id);

// ---------------------------------------------------------------------------
// 1. row counts per entity
// ---------------------------------------------------------------------------
console.log('\n--- row counts (source -> target) ---');
async function countCheck(label, srcCount, tgtCount, note = '') {
  ok(
    label,
    srcCount === tgtCount,
    `src=${srcCount} tgt=${tgtCount}${note ? ' (' + note + ')' : ''}`
  );
}

const srcCustomers = await S(
  `with ids as (
     select "customerId" as id from customer_channels_channel where "channelId"=$1
     union select o."customerId" from "order" o join order_channels_channel occ on occ."orderId"=o.id
       where occ."channelId"=$1 and o."customerId" is not null
     union select (meta->>'customerId')::int from ledger_journal_line where "channelId"=$1 and meta ? 'customerId'
     union select (meta->>'supplierId')::int from ledger_journal_line where "channelId"=$1 and meta ? 'supplierId'
   ),
   referenced as (
     select o."customerId" as id from "order" o join order_channels_channel occ on occ."orderId"=o.id
       where occ."channelId"=$1 and o."customerId" is not null
     union select (meta->>'customerId')::int from ledger_journal_line where "channelId"=$1 and meta ? 'customerId'
     union select (meta->>'supplierId')::int from ledger_journal_line where "channelId"=$1 and meta ? 'supplierId'
   )
   select count(*)::int n from customer c join ids on ids.id=c.id
   where c."deletedAt" is null or c.id in (select id from referenced)`,
  [CHANNEL_ID]
);
const tgtCustomers = await T('select count(*)::int n from public.customers where company_id=$1', [
  companyId,
]);
await countCheck(
  'customers',
  srcCustomers[0].n,
  tgtCustomers[0].n,
  'channel members + order/ledger-referenced (referenced soft-deleted migrate with notes marker)'
);

// migrate.mjs also migrates soft-deleted variants (and their products) that are
// still referenced by remaining stock or migratable-order lines (inserted
// inactive). Mirror that inclusion in the source counts.
const REF_DEL_VARIANTS = `
  select v.id, v."productId" from product_variant v
  where v."deletedAt" is not null and (
    exists (select 1 from inventory_batch b
            where b."productVariantId"=v.id and b."channelId"=$1 and b.quantity>0)
    or exists (select 1 from order_line l
               join "order" o on o.id = l."orderId" and o.type='Regular'
               join order_channels_channel occ on occ."orderId"=o.id
               where l."productVariantId"=v.id and occ."channelId"=$1
                 and (o.state in ('Fulfilled','Shipped','Delivered','PartiallyShipped','PaymentSettled','Cancelled','ArrangingPayment')
                      or o."customFieldsReversedat" is not null)))`;

const srcProducts = await S(
  `with ref as (${REF_DEL_VARIANTS})
   select (select count(*)::int from product p join product_channels_channel pcc on pcc."productId"=p.id
            where pcc."channelId"=$1 and p."deletedAt" is null)
        + (select count(*)::int from product p
            where p."deletedAt" is not null and p.id in (select distinct "productId" from ref)) as n`,
  [CHANNEL_ID]
);
const tgtProducts = await T('select count(*)::int n from public.products where company_id=$1', [
  companyId,
]);
await countCheck(
  'products',
  srcProducts[0].n,
  tgtProducts[0].n,
  'excl. soft-deleted (referenced deleted migrate inactive)'
);

const srcVariants = await S(
  `with ref as (${REF_DEL_VARIANTS})
   select (select count(*)::int from product_variant v
            join product_variant_channels_channel vcc on vcc."productVariantId"=v.id
            join product p on p.id = v."productId"
            where vcc."channelId"=$1 and v."deletedAt" is null and p."deletedAt" is null)
        + (select count(*)::int from ref) as n`,
  [CHANNEL_ID]
);
const tgtVariants = await T(
  'select count(*)::int n from public.product_variants where company_id=$1',
  [companyId]
);
await countCheck('variants', srcVariants[0].n, tgtVariants[0].n);

const srcBatches = await S(
  'select count(*)::int n from inventory_batch where "channelId"=$1 and quantity>0',
  [CHANNEL_ID]
);
const tgtBatches = await T(
  'select count(*)::int n from public.inventory_batches where company_id=$1',
  [companyId]
);
await countCheck('inventory_batches', srcBatches[0].n, tgtBatches[0].n, 'only quantity>0 migrated');

// orders: completed + voided migrate; ArrangingPayment with settled payments or
// ledger postings migrates as pending_payment (layaway); drafts and abandoned
// checkouts are skipped by design
const srcOrders = await S(
  `select o.id, o.state, o."customFieldsReversedat",
          (select coalesce(sum(p.amount),0) from payment p where p."orderId"=o.id and p.state='Settled')::float8 as settled,
          (select count(*)::int from ledger_journal_entry le where le."channelId"=occ."channelId" and le."sourceId"=o.id::text) as ledger_n
   from "order" o
   join order_channels_channel occ on occ."orderId"=o.id where occ."channelId"=$1 and o.type='Regular'`,
  [CHANNEL_ID]
);
const COMPLETED = ['Fulfilled', 'Shipped', 'Delivered', 'PartiallyShipped', 'PaymentSettled'];
const migratable = srcOrders.filter(
  o =>
    o.customFieldsReversedat != null ||
    o.state === 'Cancelled' ||
    COMPLETED.includes(o.state) ||
    (o.state === 'ArrangingPayment' && (o.settled > 0 || o.ledger_n > 0))
);
const parked = srcOrders.filter(o => !migratable.includes(o));
const tgtOrders = await T('select count(*)::int n from public.orders where company_id=$1', [
  companyId,
]);
await countCheck(
  'orders',
  migratable.length,
  tgtOrders[0].n,
  `${parked.length} draft/abandoned-checkout deliberately skipped`
);
for (const o of parked)
  notes.push(`skipped draft/parked order ${o.id} (${o.state}) — close before cutover`);

const srcLines = await S(
  `select count(*)::int n from order_line l where l."orderId" = any($1::int[])
     and coalesce(nullif(l.quantity,0), l."orderPlacedQuantity") > 0`,
  [migratable.map(o => o.id)]
);
const tgtLines = await T('select count(*)::int n from public.order_lines where company_id=$1', [
  companyId,
]);
await countCheck(
  'order_lines',
  srcLines[0].n,
  tgtLines[0].n,
  'voided orders use orderPlacedQuantity'
);

const srcPays = await S(
  `select count(*)::int n from payment where "orderId" = any($1::int[]) and amount > 0 and method <> 'reconciliation'`,
  [migratable.map(o => o.id)]
);
const tgtPays = await T('select count(*)::int n from public.payments where company_id=$1', [
  companyId,
]);
await countCheck('payments', srcPays[0].n, tgtPays[0].n);

const srcEntries = await S(
  `select count(distinct e.id)::int n from ledger_journal_entry e
   join ledger_journal_line l on l."entryId"=e.id and (l.debit>0 or l.credit>0)
   where e."channelId"=$1`,
  [CHANNEL_ID]
);
const tgtEntries = await T(
  'select count(*)::int n from public.ledger_journal_entries where company_id=$1',
  [companyId]
);
await countCheck(
  'ledger_journal_entries',
  srcEntries[0].n,
  tgtEntries[0].n,
  'verbatim (all-zero-line v1 entries skipped)'
);

const srcJLines = await S(
  'select count(*)::int n from ledger_journal_line where "channelId"=$1 and (debit>0 or credit>0)',
  [CHANNEL_ID]
);
const srcDouble = await S(
  'select count(*)::int n from ledger_journal_line where "channelId"=$1 and debit>0 and credit>0',
  [CHANNEL_ID]
);
const tgtJLines = await T(
  'select count(*)::int n from public.ledger_journal_lines where company_id=$1',
  [companyId]
);
await countCheck(
  'ledger_journal_lines',
  srcJLines[0].n + srcDouble[0].n,
  tgtJLines[0].n,
  `verbatim; ${srcDouble[0].n} double-sided source line(s) split into two single-sided (target check constraint)`
);

const srcSessions = await S('select count(*)::int n from cashier_session where "channelId"=$1', [
  CHANNEL_ID,
]);
const tgtSessions = await T(
  'select count(*)::int n from public.cashier_sessions where company_id=$1',
  [companyId]
);
await countCheck('cashier_sessions', srcSessions[0].n, tgtSessions[0].n);

const srcCounts = await S(
  `select count(*)::int n from cash_drawer_count where "channelId"=$1
     and lower("countType") in ('opening','closing','mid_shift')`,
  [CHANNEL_ID]
);
const tgtCounts = await T(
  'select count(*)::int n from public.cash_drawer_counts where company_id=$1',
  [companyId]
);
await countCheck('cash_drawer_counts', srcCounts[0].n, tgtCounts[0].n);

const srcRecons = await S('select count(*)::int n from reconciliation where "channelId"=$1', [
  CHANNEL_ID,
]);
const tgtRecons = await T(
  'select count(*)::int n from public.reconciliations where company_id=$1',
  [companyId]
);
await countCheck('reconciliations', srcRecons[0].n, tgtRecons[0].n);

const srcReconAccts = await S(
  `select count(*)::int n from reconciliation_account ra join reconciliation r on r.id=ra."reconciliationId"
   where r."channelId"=$1`,
  [CHANNEL_ID]
);
const tgtReconAccts = await T(
  `select count(*)::int n from public.reconciliation_accounts ra join public.reconciliations r on r.id=ra.reconciliation_id
   where r.company_id=$1`,
  [companyId]
);
await countCheck('reconciliation_accounts', srcReconAccts[0].n, tgtReconAccts[0].n);

const tgtAccts = await T('select count(*)::int n from public.ledger_accounts where company_id=$1', [
  companyId,
]);
await countCheck('ledger_accounts (provisioned)', 22, tgtAccts[0].n); // must match migrate.mjs PROVISION CoA (22 accounts)
const tgtPms = await T('select count(*)::int n from public.payment_methods where company_id=$1', [
  companyId,
]);
await countCheck('payment_methods (provisioned)', 4, tgtPms[0].n);
const tgtLoc = await T('select count(*)::int n from public.stock_locations where company_id=$1', [
  companyId,
]);
await countCheck('stock_locations (provisioned)', 1, tgtLoc[0].n);

// ---------------------------------------------------------------------------
// 2. ledger tie-out
// ---------------------------------------------------------------------------
console.log('\n--- ledger tie-out ---');
const srcTot = await S(
  `select coalesce(sum(debit),0)::text d, coalesce(sum(credit),0)::text c
   from ledger_journal_line where "channelId"=$1`,
  [CHANNEL_ID]
);
const tgtTot = await T(
  `select coalesce(sum(debit),0)::text d, coalesce(sum(credit),0)::text c
   from public.ledger_journal_lines where company_id=$1`,
  [companyId]
);
ok(
  'Σdebit = Σcredit (source)',
  Number(srcTot[0].d) === Number(srcTot[0].c),
  `${srcTot[0].d} vs ${srcTot[0].c}`
);
ok(
  'Σdebit = Σcredit (target)',
  Number(tgtTot[0].d) === Number(tgtTot[0].c),
  `${tgtTot[0].d} vs ${tgtTot[0].c}`
);
ok(
  'ledger totals match src=tgt',
  Number(srcTot[0].d) === Number(tgtTot[0].d) && Number(srcTot[0].c) === Number(tgtTot[0].c),
  `src D${srcTot[0].d}/C${srcTot[0].c} tgt D${tgtTot[0].d}/C${tgtTot[0].c}`
);

const srcBal = await S(
  `select a.code, coalesce(sum(l.debit - l.credit),0)::text bal
   from ledger_account a left join ledger_journal_line l on l."accountId"=a.id
   where a."channelId"=$1 group by a.code`,
  [CHANNEL_ID]
);
const tgtBal = await T(
  `select a.code, coalesce(sum(l.debit - l.credit),0)::text bal
   from public.ledger_accounts a left join public.ledger_journal_lines l on l.account_id=a.id
   where a.company_id=$1 group by a.code`,
  [companyId]
);
const tgtBalMap = new Map(tgtBal.map(r => [r.code, Number(r.bal)]));
let balMismatch = 0;
for (const r of srcBal) {
  const t = tgtBalMap.get(r.code);
  if (t == null || Number(r.bal) !== t) {
    balMismatch++;
    console.log(`    account ${r.code}: src=${r.bal} tgt=${t ?? '(missing)'}`);
  }
}
ok(
  'closing balance per account code (exact)',
  balMismatch === 0,
  `${srcBal.length - balMismatch}/${srcBal.length} accounts match`
);

// ---------------------------------------------------------------------------
// 3. stock tie-out (per variant)
// ---------------------------------------------------------------------------
console.log('\n--- stock tie-out (per variant) ---');
const srcStock = await S(
  `select b."productVariantId" vid, v.sku, sum(b.quantity) qty
   from inventory_batch b join product_variant v on v.id=b."productVariantId"
   where b."channelId"=$1 and b.quantity>0 group by 1,2 order by v.sku`,
  [CHANNEL_ID]
);
const tgtStockRows = await T(
  `select v.id, sum(b.remaining) rem from public.product_variants v
   join public.inventory_batches b on b.variant_id=v.id
   where v.company_id=$1 group by v.id`,
  [companyId]
);
const tgtStock = new Map(tgtStockRows.map(r => [r.id, Number(r.rem)]));
let stockMismatch = 0;
for (const r of srcStock) {
  const newVid = maps.variant?.get(String(r.vid));
  const t = newVid ? (tgtStock.get(newVid) ?? 0) : null;
  const good = t !== null && Number(r.qty) === t;
  if (!good) stockMismatch++;
  console.log(
    `  ${good ? 'PASS' : 'FAIL'}  variant ${r.sku}: src qty=${r.qty} tgt remaining=${t ?? '(variant missing)'}`
  );
  if (!good) failures++;
}
if (!srcStock.length) console.log('  (no stock in source)');

// ---------------------------------------------------------------------------
// 4. credit tie-out (AR per customer, same computation both sides)
// ---------------------------------------------------------------------------
console.log('\n--- credit tie-out (AR per customer) ---');
const srcAr = await S(
  `select l.meta->>'customerId' cid, coalesce(sum(l.debit - l.credit),0)::text bal
   from ledger_journal_line l join ledger_account a on a.id=l."accountId"
   where l."channelId"=$1 and a.code='ACCOUNTS_RECEIVABLE' and l.meta ? 'customerId'
   group by 1`,
  [CHANNEL_ID]
);
const tgtArRows = await T(
  `select l.meta->>'customerId' cid, coalesce(sum(l.debit - l.credit),0)::text bal
   from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
   where l.company_id=$1 and a.code='ACCOUNTS_RECEIVABLE' and l.meta ? 'customerId'
   group by 1`,
  [companyId]
);
const tgtAr = new Map(tgtArRows.map(r => [r.cid, Number(r.bal)]));
let arMismatch = 0;
for (const r of srcAr) {
  const newCid = maps.customer?.get(String(r.cid));
  const name = newCid
    ? (
        await T(
          "select first_name || ' ' || coalesce(last_name,'') n from public.customers where id=$1",
          [newCid]
        )
      )[0]?.n
    : null;
  const t = newCid ? (tgtAr.get(newCid) ?? 0) : null;
  const good = t !== null && Number(r.bal) === t;
  if (!good) arMismatch++;
  console.log(
    `  ${good ? 'PASS' : 'FAIL'}  customer ${r.cid}${name ? ` (${name.trim()})` : ''}: src AR=${r.bal} tgt AR=${t ?? '(unmapped)'}`
  );
  if (!good) failures++;
}
if (!srcAr.length) console.log('  (no AR in source)');

// ---------------------------------------------------------------------------
// 5. rule-violation warnings (source rows the new system would reject)
// ---------------------------------------------------------------------------
console.log('\n--- warnings ---');
const noVariants = await S(
  `select p.id, t.name from product p join product_channels_channel pcc on pcc."productId"=p.id
   left join product_translation t on t."baseId"=p.id and t."languageCode"='en'
   where pcc."channelId"=$1 and p."deletedAt" is null
     and not exists (select 1 from product_variant v where v."productId"=p.id and v."deletedAt" is null)`,
  [CHANNEL_ID]
);
for (const p of noVariants) warnLines.push(`product ${p.id} ('${p.name}') has no variants`);

const noPrice = await S(
  `select v.id, v.sku from product_variant v join product_variant_channels_channel vcc on vcc."productVariantId"=v.id
   where vcc."channelId"=$1 and v."deletedAt" is null
     and not exists (select 1 from product_variant_price p where p."variantId"=v.id and p."channelId"=$1)`,
  [CHANNEL_ID]
);
for (const v of noPrice) warnLines.push(`variant ${v.id} (${v.sku}) has no channel price`);

// completed orders where settled payments neither equal total nor form a clean credit sale
const payMismatch = await S(
  `select o.id, o.code, o."subTotalWithTax" total,
          coalesce((select sum(p.amount) from payment p where p."orderId"=o.id and p.state='Settled'),0) paid
   from "order" o join order_channels_channel occ on occ."orderId"=o.id
   where occ."channelId"=$1 and o.state='PaymentSettled'`,
  [CHANNEL_ID]
);
for (const o of payMismatch) {
  if (Number(o.paid) !== Number(o.total)) {
    Number(o.paid) === 0 || Number(o.paid) < Number(o.total)
      ? notes.push(
          `order ${o.id} (${o.code}): paid ${o.paid} of ${o.total} -> migrated as credit sale`
        )
      : warnLines.push(`order ${o.id} (${o.code}): overpaid paid=${o.paid} total=${o.total}`);
  }
}

// target ledger meta ids left unmapped (old ints preserved)
const unmapped = await T(
  `select count(*)::int n from public.ledger_journal_lines
   where company_id=$1 and (meta->>'customerId' ~ '^[0-9]+$' or meta->>'supplierId' ~ '^[0-9]+$')`,
  [companyId]
);
if (unmapped[0].n)
  warnLines.push(
    `${unmapped[0].n} target ledger line(s) kept an unmigrated int customerId/supplierId in meta`
  );
const unmappedOrders = await T(
  `select count(*)::int n from public.ledger_journal_lines
   where company_id=$1 and meta ? 'orderId'`,
  [companyId]
);
if (unmappedOrders[0].n)
  warnLines.push(
    `${unmappedOrders[0].n} target ledger line(s) kept meta.orderId (order skipped as draft/parked)`
  );

for (const w of warnLines) console.log('  WARN: ' + w);
if (!warnLines.length) console.log('  (none)');

if (notes.length) {
  console.log('\n--- notes (by design) ---');
  for (const n of notes) console.log('  NOTE: ' + n);
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
await src.end();
await tgt.end();
process.exit(failures === 0 ? 0 : 1);
