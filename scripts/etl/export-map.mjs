// EXPORT-MAP: dump one channel's etl_id_map rows to CSV for audit.
// Usage: node scripts/etl/export-map.mjs --channel <id>
// Writes scripts/etl/out/etl_id_map_channel-<id>.csv
// (old_type, old_id, company_id, new_id). Read-only on the target.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TGT_DSN =
  process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

const args = process.argv.slice(2);
const ci = args.indexOf('--channel');
if (ci === -1) {
  console.error('usage: node scripts/etl/export-map.mjs --channel <id>');
  process.exit(1);
}
const CHANNEL_ID = Number(args[ci + 1]);

const tgt = new pg.Client(TGT_DSN);
await tgt.connect();

const { rows: mapRow } = await tgt.query(
  `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`,
  [String(CHANNEL_ID)]
);
if (!mapRow.length) {
  console.error(`channel ${CHANNEL_ID} not migrated (no etl_id_map entry)`);
  await tgt.end();
  process.exit(1);
}
const companyId = mapRow[0].new_id;

const { rows } = await tgt.query(
  'select old_type, old_id, company_id, new_id from public.etl_id_map where company_id=$1 order by old_type, old_id',
  [companyId]
);
await tgt.end();

const csvCell = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};
const lines = ['old_type,old_id,company_id,new_id'];
for (const r of rows)
  lines.push([r.old_type, r.old_id, r.company_id, r.new_id].map(csvCell).join(','));

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `etl_id_map_channel-${CHANNEL_ID}.csv`);
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log(`etl_id_map exported: ${rows.length} row(s) -> ${outPath}`);
