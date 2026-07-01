// Pure nearest-neighbour matcher + metrics for the recognition spike.
// No framework, no I/O — this is the prototype of the real `embedding-match.ts`.
// Everything here is deterministic and unit-testable.

/** L2-normalise a vector (returns a new Float32Array). */
export function l2norm(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}

/** Cosine similarity. Robust to non-normalised inputs. */
export function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Normalised mean of a set of vectors. */
export function centroid(vectors) {
  const dim = vectors[0].length;
  const acc = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) acc[i] += v[i];
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  return l2norm(acc);
}

/**
 * Build the candidate set from enrolment fingerprints.
 * enrollMap: Map<productId, Float32Array[]>
 * Returns [{ productId, vectors, centroid }]
 */
export function buildCandidates(enrollMap) {
  const out = [];
  for (const [productId, vectors] of enrollMap.entries()) {
    if (!vectors.length) continue;
    out.push({ productId, vectors, centroid: centroid(vectors) });
  }
  return out;
}

/**
 * Best match for one query embedding.
 * mode: 'max'  -> max cosine over a product's per-image fingerprints
 *       'centroid' -> cosine to the product's averaged fingerprint
 * Returns { top1, top2, margin, scores } where scores is sorted desc.
 */
export function bestMatch(query, candidates, mode = 'max') {
  const scores = candidates.map((c) => {
    let score;
    if (mode === 'centroid') {
      score = cosineSim(query, c.centroid);
    } else {
      score = -Infinity;
      for (const v of c.vectors) {
        const s = cosineSim(query, v);
        if (s > score) score = s;
      }
    }
    return { productId: c.productId, score };
  });
  scores.sort((a, b) => b.score - a.score);
  const top1 = scores[0];
  const top2 = scores[1] || { productId: null, score: -1 };
  return { top1, top2, margin: top1.score - top2.score, scores };
}

/**
 * Per-shop threshold heuristic, derived only from enrolment data.
 * Looks at how similar different products' fingerprints are to each other
 * (impostor similarity) and sets tau just above the worst case.
 * This is the candidate the spike validates against real scan photos.
 */
export function calibrateTau(candidates) {
  // Set tau from the enrolment set's OWN genuine vs impostor similarity distributions —
  // no test-label peeking. Within-product photo pairs are genuine; cross-product pairs are
  // impostor. tau should sit above the impostors (safety) and below most genuines (recall).
  // (The earlier impostor-only formula over-abstained on models whose genuine scores sit
  //  close to their impostors — e.g. MobileCLIP — throwing away real recall.)
  const genuine = [];
  const impostor = [];
  for (let i = 0; i < candidates.length; i++) {
    const vi = candidates[i].vectors;
    for (let a = 0; a < vi.length; a++) {
      for (let b = a + 1; b < vi.length; b++) genuine.push(cosineSim(vi[a], vi[b]));
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        for (const w of candidates[j].vectors) impostor.push(cosineSim(vi[a], w));
      }
    }
  }
  if (!impostor.length) return { tau: 0.5, margin: 0.04 };
  impostor.sort((a, b) => a - b);
  const impHi = impostor[Math.floor(0.98 * (impostor.length - 1))]; // above ~all impostors
  let tau = impHi + 0.02;
  if (genuine.length) {
    genuine.sort((a, b) => a - b);
    const genLo = genuine[Math.floor(0.1 * (genuine.length - 1))]; // below most genuines
    // Clean separation -> midpoint. Overlap -> lean on the impostor ceiling and let the
    // top1/top2 margin gate handle the contested region.
    tau = impHi < genLo ? (impHi + genLo) / 2 : impHi + 0.01;
  }
  return { tau: Math.max(0.2, Math.min(0.95, tau)), margin: 0.04 };
}

/**
 * Score every scan item against the candidates once.
 * scanItems: [{ productId (ground truth), vec }]
 * Returns raw per-item results (truth, predicted id, score, margin) for a given mode.
 */
export function scoreAll(scanItems, candidates, mode) {
  return scanItems.map((item) => {
    const m = bestMatch(item.vec, candidates, mode);
    return {
      truth: item.productId,
      top1Id: m.top1.productId,
      top1Score: m.top1.score,
      top2Id: m.top2.productId,
      margin: m.margin,
    };
  });
}

/** Apply a (tau, marginMin) decision gate and tally outcomes over all scans. */
export function evaluateAt(results, tau, marginMin) {
  let accepted = 0, correctAccept = 0, falseAccept = 0;
  for (const r of results) {
    const pass = r.top1Score >= tau && r.margin >= marginMin;
    if (!pass) continue; // abstain
    accepted++;
    if (r.top1Id === r.truth) correctAccept++;
    else falseAccept++;
  }
  const total = results.length;
  return {
    total,
    accepted,
    correctAccept,
    falseAccept,
    acceptRate: accepted / total,            // how often it answers
    genuineAccept: correctAccept / total,    // ≥85% target
    falseAcceptRate: falseAccept / total,    // ≤2% target (of ALL scans)
    abstainRate: 1 - accepted / total,
  };
}

/** Top-1 accuracy ignoring any threshold (is the nearest product correct?). */
export function rawTop1Accuracy(results) {
  let correct = 0;
  for (const r of results) if (r.top1Id === r.truth) correct++;
  return correct / results.length;
}

/**
 * Sweep tau and marginMin to find the operating point that maximises genuine
 * accepts while keeping false-accept rate ≤ faCap. Returns the best gate + its metrics.
 */
export function findOperatingPoint(results, faCap = 0.02) {
  let best = null;
  for (const marginMin of [0, 0.02, 0.04, 0.06, 0.08, 0.1]) {
    for (let tau = 0.2; tau <= 0.98; tau += 0.01) {
      const m = evaluateAt(results, tau, marginMin);
      if (m.falseAcceptRate <= faCap) {
        if (!best || m.genuineAccept > best.metrics.genuineAccept) {
          best = { tau: +tau.toFixed(2), marginMin, metrics: m };
        }
      }
    }
  }
  return best; // null if no gate keeps FA under the cap (all SKUs too confusable)
}

/** Surface the likely look-alike pairs: products whose scans had the smallest top1/top2 margin. */
export function lowestMarginProducts(results, n = 5) {
  const byTruth = new Map();
  for (const r of results) {
    if (!byTruth.has(r.truth)) byTruth.set(r.truth, []);
    byTruth.get(r.truth).push(r.margin);
  }
  const rows = [];
  for (const [productId, margins] of byTruth.entries()) {
    const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
    rows.push({ productId, avgMargin: +avg.toFixed(3), confusedWith: '' });
  }
  rows.sort((a, b) => a.avgMargin - b.avgMargin);
  return rows.slice(0, n);
}
