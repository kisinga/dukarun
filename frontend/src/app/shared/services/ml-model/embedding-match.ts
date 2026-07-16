/**
 * Pure nearest-neighbour matcher for on-device product recognition.
 *
 * No Angular, no I/O, no DOM — deterministic and unit-testable in isolation. Ported from the
 * recognition spike (`spikes/recognition/match.js`); the spike's label-peeking harness metrics
 * are intentionally NOT ported (they belong only in the spike).
 *
 * Vectors are L2-normalized CLIP image embeddings (MobileCLIP-S0 projection, 512-dim). A product
 * is enrolled with several per-image fingerprints; recognition compares a live frame's embedding
 * against every product's fingerprints and accepts the nearest only if it clears a calibrated
 * absolute threshold AND a top1/top2 separation margin.
 */

/** Expected embedding dimension (MobileCLIP-S0 CLIP projection output). */
export const EMBEDDING_DIM = 512;

/**
 * Catalog-independent false-accept floor: never auto-accept on an absolute cosine below this,
 * however the per-shop calibration turns out. Prefers abstaining (→ barcode/manual) over a wrong
 * match. (The spike showed an unfloored threshold could pick an unsafe tau and let false-accepts
 * climb to ~8%.)
 */
export const TAU_FLOOR = 0.5;

/** Minimum top1/top2 cosine separation required to accept — the primary look-alike guard. */
export const MARGIN_FLOOR = 0.04;

/** A product and its enrolled fingerprints (per-image vectors + their centroid). */
export interface ProductCandidate {
  productId: string;
  vectors: number[][];
  centroid: number[];
}

/** Outcome of matching one query embedding against the candidate set. */
export interface MatchResult {
  /** Best-matching product id, or null when there is nothing to match against / dim mismatch. */
  productId: string | null;
  /** Cosine similarity of the best match (top-1). */
  score: number;
  /** top1 − top2 cosine separation (0 when fewer than two candidates). */
  margin: number;
}

/** A decision gate: accept the top-1 only if `score >= tau && margin >= margin`. */
export interface Threshold {
  tau: number;
  margin: number;
}

/** How to score a product: nearest of its per-image vectors, or its averaged centroid. */
export type MatchMode = 'centroid' | 'max';

/** L2-normalize a vector (returns a new array; zero vector → zeros). */
export function l2norm(vec: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}

/** Cosine similarity. Robust to non-normalized inputs; returns 0 if either side is degenerate. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Normalized mean of a set of vectors. Returns [] for an empty set. */
export function centroid(vectors: number[][]): number[] {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  return l2norm(acc);
}

/**
 * Build the candidate set from enrolment fingerprints. Silently drops vectors that aren't the
 * expected dimension and products left with no valid vectors — a malformed or stale-shape
 * fingerprint can never corrupt a match.
 */
export function buildCandidates(enrollMap: Map<string, number[][]>): ProductCandidate[] {
  const out: ProductCandidate[] = [];
  for (const [productId, rawVectors] of enrollMap) {
    const vectors = (rawVectors ?? []).filter(
      (v) => Array.isArray(v) && v.length === EMBEDDING_DIM,
    );
    if (!vectors.length) continue;
    out.push({ productId, vectors, centroid: centroid(vectors) });
  }
  return out;
}

/**
 * Best match for one query embedding. `centroid` mode (default) scores each product by cosine to
 * its averaged fingerprint; `max` mode by the nearest single fingerprint. Returns an abstaining
 * result ({ productId: null }) when there are no candidates or the query is the wrong dimension.
 */
export function bestMatch(
  query: number[],
  candidates: ProductCandidate[],
  mode: MatchMode = 'centroid',
): MatchResult {
  if (!candidates.length || query.length !== EMBEDDING_DIM) {
    return { productId: null, score: -1, margin: 0 };
  }
  const scored = candidates.map((c) => {
    let score: number;
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
  scored.sort((a, b) => b.score - a.score);
  const top1 = scored[0];
  const top2 = scored[1];
  return {
    productId: top1.productId,
    score: top1.score,
    margin: top2 ? top1.score - top2.score : top1.score,
  };
}

/** value at a fraction (0..1) of a pre-sorted ascending array. */
function quantile(sortedAsc: number[], frac: number): number {
  if (!sortedAsc.length) return 0;
  return sortedAsc[Math.floor(frac * (sortedAsc.length - 1))];
}

/**
 * Per-shop decision gate derived ONLY from enrolment data (no test-label peeking). Within-product
 * fingerprint pairs are "genuine", cross-product pairs are "impostor"; tau is placed above the
 * impostor ceiling and below the genuine floor (midpoint when they're cleanly separated).
 *
 * A hard false-accept floor (`TAU_FLOOR`) and a fixed separation margin (`MARGIN_FLOOR`) bound the
 * result so an unlucky distribution can never trade safety for recall — the system abstains and
 * falls back to barcode rather than risk a wrong match.
 */
export function calibrateTau(candidates: ProductCandidate[]): Threshold {
  const genuine: number[] = [];
  const impostor: number[] = [];
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

  // Too few products to learn an impostor distribution → stay conservative.
  if (!impostor.length) {
    return { tau: Math.max(TAU_FLOOR, 0.6), margin: MARGIN_FLOOR };
  }

  impostor.sort((a, b) => a - b);
  const impHi = quantile(impostor, 0.98); // above ~all impostor similarities
  let tau = impHi + 0.02;
  if (genuine.length) {
    genuine.sort((a, b) => a - b);
    const genLo = quantile(genuine, 0.1); // below most genuine similarities
    tau = impHi < genLo ? (impHi + genLo) / 2 : impHi + 0.03;
  }

  // Bound: never auto-accept below the false-accept floor, never above a near-1 ceiling.
  tau = Math.min(0.98, Math.max(TAU_FLOOR, tau));
  return { tau, margin: MARGIN_FLOOR };
}

/** True when a match clears the decision gate and should be surfaced as a recognition. */
export function accepts(match: MatchResult, gate: Threshold): boolean {
  return match.productId != null && match.score >= gate.tau && match.margin >= gate.margin;
}
