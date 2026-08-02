// TIE-OUT diff: compares per-op journal captures from Vendure and Supabase as
// normalized multisets (sourceType normalized, account code, Σdebit, Σcredit),
// plus a net-per-account view. Usage: node scripts/etl/tieout/diff.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const vendure = JSON.parse(fs.readFileSync(path.join(OUT, 'vendure.json'), 'utf8'));
const supabase = JSON.parse(fs.readFileSync(path.join(OUT, 'supabase.json'), 'utf8'));

// Vendure lowercase-hyphen -> PascalCase (pre-cleared mapping)
const TYPE_MAP = {
  'variance-adjustment': 'VarianceAdjustment',
  'variance-adjustment-reversal': 'VarianceAdjustmentReversal',
  'inter-account-transfer': 'InterAccountTransfer',
};
const normType = t => TYPE_MAP[t] ?? t;

function gross(entries) {
  // map key `${sourceType}|${account}` -> {debit, credit}
  const m = new Map();
  for (const e of entries)
    for (const l of e.lines) {
      const k = `${normType(e.sourceType)}|${l.account}`;
      const v = m.get(k) ?? { debit: 0, credit: 0 };
      v.debit += l.debit; v.credit += l.credit;
      m.set(k, v);
    }
  return m;
}
function netByAccount(entries) {
  const m = new Map();
  for (const e of entries)
    for (const l of e.lines) {
      const v = m.get(l.account) ?? 0;
      m.set(l.account, v + l.debit - l.credit);
    }
  return m;
}
const fmt = m =>
  [...m.entries()].sort().map(([k, v]) =>
    typeof v === 'number' ? `    ${k}: net ${v}` : `    ${k}: DR ${v.debit} / CR ${v.credit}`).join('\n');

const opsV = Object.fromEntries(vendure.ops.map(o => [o.op, o.entries]));
const opsS = Object.fromEntries(supabase.ops.map(o => [o.op, o.entries]));
const allOps = [...new Set([...Object.keys(opsV), ...Object.keys(opsS)])];

const results = [];
for (const op of allOps) {
  const ev = opsV[op] ?? [], es = opsS[op] ?? [];
  const gv = gross(ev), gs = gross(es);
  const nv = netByAccount(ev), ns = netByAccount(es);

  const grossKeys = new Set([...gv.keys(), ...gs.keys()]);
  const grossDiffs = [...grossKeys].filter(k => {
    const a = gv.get(k) ?? { debit: 0, credit: 0 }, b = gs.get(k) ?? { debit: 0, credit: 0 };
    return a.debit !== b.debit || a.credit !== b.credit;
  });
  const netKeys = new Set([...nv.keys(), ...ns.keys()]);
  const netDiffs = [...netKeys].filter(k => (nv.get(k) ?? 0) !== (ns.get(k) ?? 0));

  results.push({ op, grossDiffs, netDiffs, gv, gs, nv, ns });
}

console.log('OP'.padEnd(32), 'GROSS', 'NET');
for (const r of results) {
  console.log(r.op.padEnd(32), r.grossDiffs.length ? 'DIFF' : 'PASS', r.netDiffs.length ? 'DIFF' : 'PASS');
}
console.log('\n===== DETAIL =====');
for (const r of results) {
  if (!r.grossDiffs.length && !r.netDiffs.length) continue;
  console.log(`\n--- ${r.op}`);
  if (r.grossDiffs.length) {
    console.log('  gross diffs (sourceType|account):');
    for (const k of r.grossDiffs.sort()) {
      const a = r.gv.get(k), b = r.gs.get(k);
      console.log(`    ${k}\n      vendure : ${a ? `DR ${a.debit} / CR ${a.credit}` : '(absent)'}\n      supabase: ${b ? `DR ${b.debit} / CR ${b.credit}` : '(absent)'}`);
    }
  }
  if (r.netDiffs.length) {
    console.log('  net diffs (account):');
    for (const k of r.netDiffs.sort())
      console.log(`    ${k}: vendure net ${r.nv.get(k) ?? 0} vs supabase net ${r.ns.get(k) ?? 0}`);
  }
}
fs.writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(results.map(({ gv, gs, nv, ns, ...r }) => ({
  ...r,
  vendureGross: Object.fromEntries(gv), supabaseGross: Object.fromEntries(gs),
  vendureNet: Object.fromEntries(nv), supabaseNet: Object.fromEntries(ns),
})), null, 2));
console.log('\nwrote out/diff.json');
