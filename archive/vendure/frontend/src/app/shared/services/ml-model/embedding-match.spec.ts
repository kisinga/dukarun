import {
  EMBEDDING_DIM,
  MARGIN_FLOOR,
  TAU_FLOOR,
  accepts,
  bestMatch,
  buildCandidates,
  calibrateTau,
  centroid,
  cosineSim,
  l2norm,
} from './embedding-match';

const DIM = EMBEDDING_DIM;

/** A DIM-length vector built from a per-index fill fn. */
function makeVec(fill: (i: number) => number): number[] {
  return Array.from({ length: DIM }, (_, i) => fill(i));
}

/** Unit vector that is a small blend of axes k and j (deterministic "fingerprint near k"). */
function blend(k: number, j: number, t: number): number[] {
  return l2norm(makeVec((i) => (i === k ? 1 - t : i === j ? t : 0)));
}

describe('embedding-match', () => {
  describe('l2norm / cosineSim', () => {
    it('normalizes to unit length', () => {
      const n = l2norm([3, 4]);
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 6);
    });

    it('cosine: identical = 1, orthogonal = 0', () => {
      expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1, 6);
      expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
    });

    it('cosine: mismatched length → 0 (never throws)', () => {
      expect(cosineSim([1, 2, 3], [1, 2])).toBe(0);
    });
  });

  describe('centroid', () => {
    it('empty set → []', () => {
      expect(centroid([])).toEqual([]);
    });

    it('averages then normalizes', () => {
      const c = centroid([
        [1, 0],
        [0, 1],
      ]);
      expect(c[0]).toBeCloseTo(c[1], 6);
      expect(Math.hypot(c[0], c[1])).toBeCloseTo(1, 6);
    });
  });

  describe('buildCandidates', () => {
    it('drops wrong-dimension vectors and empty products', () => {
      const map = new Map<string, number[][]>([
        ['a', [blend(0, 1, 0.05), [1, 2, 3] /* wrong dim */]],
        ['b', [[1, 2, 3] /* only wrong dim */]],
        ['c', []],
      ]);
      const candidates = buildCandidates(map);
      expect(candidates.map((c) => c.productId)).toEqual(['a']);
      expect(candidates[0].vectors.length).toBe(1);
      expect(candidates[0].centroid.length).toBe(DIM);
    });
  });

  describe('bestMatch', () => {
    const candidates = buildCandidates(
      new Map<string, number[][]>([
        ['A', [blend(0, 1, 0.02), blend(0, 1, 0.05), blend(0, 2, 0.03)]],
        ['B', [blend(100, 101, 0.02), blend(100, 102, 0.04)]],
      ]),
    );

    it('no candidates → abstains', () => {
      const m = bestMatch(blend(0, 1, 0.01), []);
      expect(m.productId).toBeNull();
    });

    it('wrong query dimension → abstains', () => {
      const m = bestMatch([1, 2, 3], candidates);
      expect(m.productId).toBeNull();
    });

    it('picks the nearest product with a clear margin', () => {
      const m = bestMatch(blend(0, 1, 0.01), candidates);
      expect(m.productId).toBe('A');
      expect(m.score).toBeGreaterThan(0.9);
      expect(m.margin).toBeGreaterThan(0.5);
    });

    it('defaults to centroid mode', () => {
      const m = bestMatch(blend(100, 101, 0.01), candidates, 'centroid');
      expect(m.productId).toBe('B');
    });
  });

  describe('calibrateTau', () => {
    it('cleanly separated catalog → tau between the distributions, bounded, margin floored', () => {
      const candidates = buildCandidates(
        new Map<string, number[][]>([
          ['A', [blend(0, 1, 0.02), blend(0, 1, 0.04), blend(0, 2, 0.03)]],
          ['B', [blend(100, 101, 0.02), blend(100, 102, 0.04), blend(100, 103, 0.03)]],
        ]),
      );
      const gate = calibrateTau(candidates);
      expect(gate.tau).toBeGreaterThanOrEqual(TAU_FLOOR);
      expect(gate.tau).toBeLessThanOrEqual(0.98);
      expect(gate.margin).toBe(MARGIN_FLOOR);
    });

    it('never returns a tau below the false-accept floor', () => {
      // Heavily overlapping catalog (all near the same axis) would naively push tau low.
      const candidates = buildCandidates(
        new Map<string, number[][]>([
          ['A', [blend(0, 1, 0.02), blend(0, 1, 0.03)]],
          ['B', [blend(0, 1, 0.04), blend(0, 1, 0.05)]],
        ]),
      );
      const gate = calibrateTau(candidates);
      expect(gate.tau).toBeGreaterThanOrEqual(TAU_FLOOR);
    });

    it('single product (no impostors) → conservative tau', () => {
      const candidates = buildCandidates(
        new Map<string, number[][]>([['A', [blend(0, 1, 0.02), blend(0, 1, 0.03)]]]),
      );
      const gate = calibrateTau(candidates);
      expect(gate.tau).toBeGreaterThanOrEqual(TAU_FLOOR);
    });
  });

  describe('accepts', () => {
    const gate = { tau: 0.6, margin: 0.04 };
    it('rejects below tau, below margin, or null id', () => {
      expect(accepts({ productId: 'A', score: 0.7, margin: 0.1 }, gate)).toBe(true);
      expect(accepts({ productId: 'A', score: 0.5, margin: 0.1 }, gate)).toBe(false);
      expect(accepts({ productId: 'A', score: 0.7, margin: 0.01 }, gate)).toBe(false);
      expect(accepts({ productId: null, score: 0.9, margin: 0.9 }, gate)).toBe(false);
    });
  });
});
