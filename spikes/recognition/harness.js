// Spike orchestration + UI. Point it at ONE dataset folder whose subfolders are items
// (each holding that product's photos). The harness splits each item's photos into an
// enrolment set and a held-out test set, then reports the pass/fail metrics from
// ML_PRODUCT_RECOGNITION.md §9.

import { EMBEDDERS } from './embedders.js';
import {
  buildCandidates, scoreAll, rawTop1Accuracy, findOperatingPoint,
  evaluateAt, calibrateTau, lowestMarginProducts,
} from './match.js';

// Pass/fail gates from the design doc.
const FA_CAP = 0.02;          // false-accept rate ≤ 2% of all scans
const GENUINE_TARGET = 0.85;  // genuine top-1 accept ≥ 85%
const LATENCY_BUDGET_MS = 100;

const els = {
  dataset: document.getElementById('dataset'),
  enrollPct: document.getElementById('enrollPct'),
  which: document.getElementById('which'),
  run: document.getElementById('run'),
  out: document.getElementById('out'),
  status: document.getElementById('status'),
};

let datasetFiles = [];

els.dataset.addEventListener('change', (e) => {
  datasetFiles = [...e.target.files];
  setStatus();
});
els.enrollPct.addEventListener('change', setStatus);

function setStatus(msg) {
  const groups = groupByProduct(datasetFiles);
  const imgs = [...groups.values()].reduce((a, v) => a + v.length, 0);
  const counts = `dataset: ${groups.size} items / ${imgs} photos · enrol ${els.enrollPct.value}% per item`;
  els.status.textContent = msg ? `${msg}\n${counts}` : counts;
  els.run.disabled = groups.size < 2;
}

// productId = the folder immediately containing the file (…/<productId>/<file>).
function groupByProduct(files) {
  const map = new Map();
  for (const f of files) {
    if (!/\.(jpe?g|png|webp|bmp)$/i.test(f.name)) continue;
    const path = f.webkitRelativePath || f.name;
    const parts = path.split('/');
    const productId = parts.length >= 2 ? parts[parts.length - 2] : 'unknown';
    if (!map.has(productId)) map.set(productId, []);
    map.get(productId).push(f);
  }
  return map;
}

// --- deterministic, seeded shuffle so the enrol/test split is reproducible per item ---
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const a = [...arr];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split each item's photos into enrolment + held-out test sets.
 * Items with a single photo become enrol-only distractors (kept as candidates so they can
 * still cause false accepts, but not tested). Returns disjoint maps + a tooFew count.
 */
function splitGroups(groups, enrollFrac) {
  const enrollMap = new Map();
  const scanMap = new Map();
  let tooFew = 0;
  for (const [productId, files] of groups.entries()) {
    const shuffled = shuffle(files, hashStr(productId));
    const n = shuffled.length;
    if (n === 0) continue;
    const enrollCount = n === 1 ? 1 : Math.min(n - 1, Math.max(1, Math.round(n * enrollFrac)));
    enrollMap.set(productId, shuffled.slice(0, enrollCount));
    const scan = shuffled.slice(enrollCount);
    if (scan.length) scanMap.set(productId, scan);
    else tooFew++;
  }
  return { enrollMap, scanMap, tooFew };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ el: img, url });
    img.onerror = () => reject(new Error('image load failed: ' + file.name));
    img.src = url;
  });
}

function log(line = '') { els.out.textContent += line + '\n'; }
function pct(x) { return (100 * x).toFixed(1) + '%'; }
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; }
function p90(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(0.9 * (s.length - 1))] || 0; }

async function embedGroup(embedder, grouped, label) {
  const out = new Map();
  let done = 0;
  const total = [...grouped.values()].reduce((a, v) => a + v.length, 0);
  const latencies = [];
  for (const [productId, files] of grouped.entries()) {
    const vecs = [];
    for (const file of files) {
      const image = await loadImage(file);
      const t0 = performance.now();
      const vec = await embedder.embed(image);
      latencies.push(performance.now() - t0);
      URL.revokeObjectURL(image.url);
      vecs.push(vec);
      done++;
      els.status.textContent = `${label}: embedding ${done}/${total}…`;
    }
    out.set(productId, vecs);
  }
  return { embeddings: out, latencies };
}

async function runEmbedder(key, split) {
  const def = EMBEDDERS[key];
  log(`\n========================================`);
  log(`EMBEDDER: ${def.label}`);
  log(`========================================`);
  els.status.textContent = `loading ${def.label}…`;

  let embedder;
  try {
    embedder = await def.create();
  } catch (err) {
    log(`!! failed to load: ${err.message}`);
    log(`   (network? for MobileCLIP try device 'wasm' or dtype 'fp16' in embedders.js)`);
    return;
  }

  const enrolled = await embedGroup(embedder, split.enrollMap, 'enrol');
  const scanned = await embedGroup(embedder, split.scanMap, 'test');
  log(`model: ${embedder.name}  ·  dim: ${embedder.dim}`);

  const scanItems = [];
  for (const [productId, vecs] of scanned.embeddings.entries())
    for (const vec of vecs) scanItems.push({ productId, vec });

  const candidates = buildCandidates(enrolled.embeddings);

  for (const mode of ['max', 'centroid']) {
    const results = scoreAll(scanItems, candidates, mode);
    const rawAcc = rawTop1Accuracy(results);
    const op = findOperatingPoint(results, FA_CAP);
    const cal = calibrateTau(candidates);
    const calM = evaluateAt(results, cal.tau, cal.margin);
    log(`\n[${mode}-over-set]`);
    log(`  raw top-1 accuracy (no threshold): ${pct(rawAcc)}`);
    log(`  REALISTIC — auto-calibrated tau=${cal.tau.toFixed(2)} margin≥${cal.margin}: ` +
        `genuine ${pct(calM.genuineAccept)}, FA ${pct(calM.falseAcceptRate)}, abstain ${pct(calM.abstainRate)}`);
    if (op) {
      log(`  CEILING — oracle gate (peeks at test labels) tau=${op.tau} margin≥${op.marginMin}: ` +
          `genuine ${pct(op.metrics.genuineAccept)}, FA ${pct(op.metrics.falseAcceptRate)}`);
    } else {
      log(`  CEILING — no gate keeps FA ≤ ${pct(FA_CAP)} even with oracle tuning (some items barcode-only)`);
    }
  }

  const maxResults = scoreAll(scanItems, candidates, 'max');
  log(`\n  suspected look-alikes (lowest avg margin):`);
  for (const row of lowestMarginProducts(maxResults))
    log(`     ${row.productId}: avg margin ${row.avgMargin}`);

  const lat = scanned.latencies;
  log(`\n  embed latency (test): median ${median(lat).toFixed(0)}ms · p90 ${p90(lat).toFixed(0)}ms`);

  // Verdict uses the REALISTIC (auto-calibrated, no label peeking) number — what the app does.
  const realistic = ['max', 'centroid']
    .map((mode) => {
      const cal = calibrateTau(candidates);
      return { mode, m: evaluateAt(scoreAll(scanItems, candidates, mode), cal.tau, cal.margin) };
    })
    .sort((a, b) => b.m.genuineAccept - a.m.genuineAccept)[0];
  const medLat = median(lat);
  const passAccuracy = realistic.m.genuineAccept >= GENUINE_TARGET && realistic.m.falseAcceptRate <= FA_CAP;
  const passLatency = medLat <= LATENCY_BUDGET_MS;
  log(`\n  VERDICT (realistic, auto-calibrated — what the app would actually do): ` +
      `${passAccuracy && passLatency ? 'PASS' : 'CHECK'}`);
  log(`     best mode: ${realistic.mode}-over-set`);
  log(`     genuine ≥${pct(GENUINE_TARGET)} @ FA≤${pct(FA_CAP)}: ${passAccuracy ? 'PASS' : 'FAIL'} ` +
      `(genuine ${pct(realistic.m.genuineAccept)}, FA ${pct(realistic.m.falseAcceptRate)})`);
  log(`     median latency ≤${LATENCY_BUDGET_MS}ms: ${passLatency ? 'PASS' : 'FAIL'} (${medLat.toFixed(0)}ms)`);
  log(`     note: run on a real mid-tier Android for the latency number that counts.`);
}

els.run.addEventListener('click', async () => {
  els.run.disabled = true;
  els.out.textContent = '';

  const groups = groupByProduct(datasetFiles);
  const enrollFrac = Math.min(0.9, Math.max(0.1, Number(els.enrollPct.value) / 100));
  const split = splitGroups(groups, enrollFrac);

  log(`split: ${split.enrollMap.size} items enrolled, ` +
      `${split.scanMap.size} items have held-out test photos` +
      (split.tooFew ? ` (${split.tooFew} item(s) had only 1 photo → enrol-only distractors)` : ''));
  log(`note: enrol/test split is from the SAME photos — a separate-session test is stricter ` +
      `(see README).`);

  if (split.scanMap.size === 0) {
    log(`\n!! no item has ≥2 photos, so nothing can be tested. Add more photos per item.`);
    els.status.textContent = 'not enough photos per item.';
    els.run.disabled = false;
    return;
  }

  const keys = els.which.value === 'both' ? ['mobilenet', 'mobileclip'] : [els.which.value];
  try {
    for (const key of keys) await runEmbedder(key, split);
    els.status.textContent = 'done.';
  } catch (err) {
    log(`\n!! error: ${err.message}`);
    els.status.textContent = 'error — see output.';
  } finally {
    els.run.disabled = false;
  }
});

setStatus();
