import { calculateProductStats, isLowStock, LOW_STOCK_THRESHOLD } from './product-stats.util';

const daysFromNow = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

describe('product-stats.util', () => {
  describe('isLowStock', () => {
    it('returns true at default threshold', () => {
      expect(isLowStock(LOW_STOCK_THRESHOLD)).toBe(true);
      expect(isLowStock(0)).toBe(true);
    });

    it('returns false above default threshold', () => {
      expect(isLowStock(LOW_STOCK_THRESHOLD + 1)).toBe(false);
    });

    it('respects custom threshold', () => {
      expect(isLowStock(5, 5)).toBe(true);
      expect(isLowStock(6, 5)).toBe(false);
    });
  });

  describe('calculateProductStats', () => {
    it('calculates totals without batches', () => {
      const products = [
        {
          id: 'p1',
          variants: [{ stockOnHand: 5 }, { stockOnHand: 15 }],
        },
        {
          id: 'p2',
          variants: [{ stockOnHand: 3 }],
        },
      ];

      const stats = calculateProductStats(products as any);
      expect(stats.totalProducts).toBe(2);
      expect(stats.totalVariants).toBe(3);
      expect(stats.totalStock).toBe(23);
      expect(stats.lowStock).toBe(2);
      expect(stats.expiringSoon).toBe(0);
      expect(stats.expired).toBe(0);
    });

    it('counts expiring-soon and expired batches', () => {
      const products = [
        {
          id: 'p1',
          variants: [
            {
              stockOnHand: 20,
              inventoryBatches: [{ expiryDate: daysFromNow(10) }],
            },
          ],
        },
        {
          id: 'p2',
          variants: [
            {
              stockOnHand: 20,
              inventoryBatches: [{ expiryDate: daysFromNow(-5) }],
            },
          ],
        },
        {
          id: 'p3',
          variants: [
            {
              stockOnHand: 20,
              inventoryBatches: [{ expiryDate: daysFromNow(60) }],
            },
          ],
        },
      ];

      const stats = calculateProductStats(products as any);
      expect(stats.expiringSoon).toBe(1);
      expect(stats.expired).toBe(1);
    });

    it('uses custom low-stock threshold', () => {
      const products = [
        {
          id: 'p1',
          variants: [{ stockOnHand: 8 }],
        },
      ];

      const stats = calculateProductStats(products as any, 5);
      expect(stats.lowStock).toBe(0);
    });
  });
});
