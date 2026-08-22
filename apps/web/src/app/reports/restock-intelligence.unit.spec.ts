import { describe, expect, it } from 'vitest';
import {
  coverWidth,
  quantityChangeLabel,
  restockDecision,
  sparklineHeights,
} from './restock-intelligence';

const facts = (
  currentQuantity: number,
  previousQuantity: number,
  stock: number,
  daysCover: number | null
) => ({ currentQuantity, previousQuantity, stock, daysCover });

describe('restock intelligence presentation', () => {
  it('prioritizes low stock and short cover before rising demand', () => {
    expect(restockDecision(facts(20, 10, 2, 3), 5).label).toBe('Restock now');
    expect(restockDecision(facts(20, 10, 20, 10), 5).label).toBe('Restock soon');
    expect(restockDecision(facts(20, 10, 50, 25), 5).label).toBe('Demand rising');
  });

  it('separates healthy and slow-moving stock', () => {
    expect(restockDecision(facts(10, 10, 60, 60), 5).label).toBe('Stock healthy');
    expect(restockDecision(facts(0, 4, 60, null), 5).label).toBe('Slow-moving');
  });

  it('treats a sold-out product with prior demand as a restock risk', () => {
    expect(restockDecision(facts(0, 4, 0, null), 5).label).toBe('Restock now');
  });

  it('describes demand changes without infinite percentages', () => {
    expect(quantityChangeLabel(5, 0)).toBe('New demand');
    expect(quantityChangeLabel(12, 10)).toBe('+20%');
    expect(quantityChangeLabel(5, 10)).toBe('-50%');
  });

  it('normalizes sparklines and coverage bars to stable percentages', () => {
    expect(sparklineHeights([0, 2, 4])).toEqual([4, 50, 100]);
    expect(coverWidth(null)).toBe(0);
    expect(coverWidth(14)).toBeCloseTo(23.333, 2);
    expect(coverWidth(90)).toBe(100);
  });
});
