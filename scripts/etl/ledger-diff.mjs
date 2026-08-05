// DEEP LEDGER DIFF: line-by-line comparison of source (v1, vendure_prod)
// vs target (v2, local supabase) for one channel's migrated company.
// Compares per-entry multisets of (account_code, debit, credit), plus
// entry-level sourceType/sourceId/memo. The one documented transform is
// handled: a double-sided source line (debit>0 and credit>0) is split into
// two single-sided lines in the target.
// Usage: SOURCE_DB_URL=... node /tmp/ledger-diff.mjs <channelId>
import pg from 'pg';

const SRC =
  process.env.SOURCE_DB_URL ??
  'postgres://vendure:changeme-secure-password@localhost:5432/vendure_prod';
const TGT = process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const CHANNEL = Number(process.argv[2]);
if (!CHANNEL) {
  console.error('usage: node ledger-diff.mjs <channelId>');
  process.exit(1);
}

pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));
const src = new pg.Client(SRC);
const tgt = new pg.Client(TGT);
await src.connect();
await tgt.connect();

const { rows: mapRow } = await tgt.query(
  `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`,
  [String(CHANNEL)]
);
if (!mapRow.length) {
  console.error('channel not migrated');
  process.exit(1);
}
const companyId = mapRow[0].new_id;

// --- source: entry -> multiset of "code|D|C" (double-sided lines pre-split) ---
// Zero-amount lines (v1 zero-cost COGS artifacts) excluded: v2's nonzero line
// check forbids them and the ETL drops them (all-zero entries drop whole).
const { rows: sLines } = await src.query(
  `select e.id as entry_id, e."sourceType", e."sourceId", e.memo, a.code, l.debit, l.credit
   from ledger_journal_entry e
   join ledger_journal_line l on l."entryId" = e.id and (l.debit > 0 or l.credit > 0)
   join ledger_account a on a.id = l."accountId"
   where e."channelId" = $1`,
  [CHANNEL]
);

function key(code, d, c) {
  return `${code}|${d}|${c}`;
}
function addLine(map, eid, meta, code, d, c) {
  if (!map.has(eid)) map.set(eid, { meta, lines: new Map() });
  const e = map.get(eid);
  const k = key(code, d, c);
  e.lines.set(k, (e.lines.get(k) ?? 0) + 1);
}
const sMap = new Map();
for (const r of sLines) {
  const meta = { st: r.sourceType, sid: r.sourceId, memo: r.memo ?? null };
  if (r.debit > 0 && r.credit > 0) {
    // the documented split
    addLine(sMap, r.entry_id, meta, r.code, r.debit, 0);
    addLine(sMap, r.entry_id, meta, r.code, 0, r.credit);
  } else {
    addLine(sMap, r.entry_id, meta, r.code, r.debit, r.credit);
  }
}

// --- target ---
const { rows: tLines } = await tgt.query(
  `select e.id as entry_id, e.source_type, e.source_id, e.memo, a.code, l.debit, l.credit
   from public.ledger_journal_entries e
   join public.ledger_journal_lines l on l.entry_id = e.id
   join public.ledger_accounts a on a.id = l.account_id
   where e.company_id = $1`,
  [companyId]
);
const tMap = new Map();
for (const r of tLines) {
  const meta = { st: r.source_type, sid: r.source_id, memo: r.memo ?? null };
  addLine(tMap, `${r.source_type}::${r.source_id}`, meta, r.code, r.debit, r.credit);
}

// match entries by (sourceType, sourceId); compare line multisets
const tByKey = new Map();
for (const e of tMap.values()) {
  tByKey.set(`${e.meta.st}::${e.meta.sid}`, e);
}
let ok = 0,
  lineDiff = 0,
  missing = 0,
  memoDiff = 0;
const problems = [];
for (const e of sMap.values()) {
  const k = `${e.meta.st}::${e.meta.sid}`;
  const t = tByKey.get(k);
  if (!t) {
    missing++;
    problems.push(`MISSING in target: ${k}`);
    tByKey.delete(k);
    continue;
  }
  tByKey.delete(k);
  // memo compare (null vs '' tolerated)
  if ((e.meta.memo ?? '') !== (t.meta.memo ?? '')) {
    memoDiff++;
    problems.push(`MEMO diff ${k}: src='${e.meta.memo}' tgt='${t.meta.memo}'`);
  }
  // multiset compare
  let same = e.lines.size === t.lines.size;
  if (same)
    for (const [lk, n] of e.lines)
      if (t.lines.get(lk) !== n) {
        same = false;
        break;
      }
  if (same) ok++;
  else {
    lineDiff++;
    const onlyS = [],
      onlyT = [];
    for (const [lk, n] of e.lines) {
      const d = n - (t.lines.get(lk) ?? 0);
      for (let i = 0; i < d; i++) onlyS.push(lk);
    }
    for (const [lk, n] of t.lines) {
      const d = n - (e.lines.get(lk) ?? 0);
      for (let i = 0; i < d; i++) onlyT.push(lk);
    }
    problems.push(
      `LINE diff ${k}:\n    only-src: ${onlyS.join(' , ') || '-'}\n    only-tgt: ${onlyT.join(' , ') || '-'}`
    );
  }
}
const extra = tByKey.size;

console.log(`\n=== DEEP LEDGER DIFF channel ${CHANNEL} -> company ${companyId} ===`);
console.log(`source entries: ${sMap.size}  target entries: ${tMap.size}`);
console.log(`identical line multisets: ${ok}`);
console.log(
  `line diffs: ${lineDiff}  missing in target: ${missing}  extra in target: ${extra}  memo diffs: ${memoDiff}`
);
if (problems.length) {
  console.log('\n--- problems (first 30) ---');
  for (const p of problems.slice(0, 30)) console.log('  ' + p);
} else {
  console.log('\nALL ENTRIES LINE-IDENTICAL');
}
await src.end();
await tgt.end();
