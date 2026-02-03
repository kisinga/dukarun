import { TestBed } from '@angular/core/testing';
import {
  computeNextDecrease,
  computeNextIncrease,
  PriceModificationService,
} from './price-modification.service';

describe('PriceModificationService', () => {
  let service: PriceModificationService;
  const variantId = 'variant-1';
  const context = 'unit' as const;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PriceModificationService);
  });

  afterEach(() => {
    service.clearStacks(variantId);
  });

  describe('computeNextIncrease', () => {
    it('should compute 3% increase and round', () => {
      expect(computeNextIncrease(100)).toBe(103);
      expect(computeNextIncrease(103)).toBe(106);
      expect(computeNextIncrease(106)).toBe(109);
    });
  });

  describe('computeNextDecrease', () => {
    it('should compute 3% decrease and round', () => {
      expect(computeNextDecrease(100, -Infinity)).toBe(97);
      expect(computeNextDecrease(97, -Infinity)).toBe(94);
    });

    it('should floor at wholesale when computed value is below', () => {
      expect(computeNextDecrease(78, 77)).toBe(77); // 75.66 rounds to 76, but floor is 77
      expect(computeNextDecrease(80, 77)).toBe(78); // 77.6 rounds to 78, above floor
    });
  });

  describe('increase sequence from 100', () => {
    it('should build stack [100,103,106,...,130] over 9 increases', () => {
      let current = 100;
      const expected = [100, 103, 106, 109, 112, 115, 119, 122, 126, 130];

      for (let i = 0; i < 9; i++) {
        const result = service.increasePrice(variantId, current, context);
        expect(result).not.toBeNull();
        current = result!.newPrice;
        expect(current).toBe(expected[i + 1]);
      }
      expect(current).toBe(130);
      expect(service.getUndoStackLength(variantId, context)).toBe(9);
    });

    it('should return null on 10th increase (max steps)', () => {
      let current = 100;
      for (let i = 0; i < 9; i++) {
        const result = service.increasePrice(variantId, current, context);
        current = result!.newPrice;
      }
      const tenth = service.increasePrice(variantId, current, context);
      expect(tenth).toBeNull();
      expect(current).toBe(130);
    });
  });

  describe('decrease from up-stack (backtrack, no recalculation)', () => {
    it('should pop back 130 → 126 → 122 → ... → 100', () => {
      let current = 100;
      for (let i = 0; i < 9; i++) {
        const r = service.increasePrice(variantId, current, context);
        current = r!.newPrice;
      }
      expect(current).toBe(130);

      const sequence = [126, 122, 119, 115, 112, 109, 106, 103, 100];
      for (const expected of sequence) {
        const result = service.decreasePrice(variantId, current, 1, undefined, context);
        expect(result).not.toBeNull();
        current = result!.newPrice;
        expect(current).toBe(expected);
      }
      expect(current).toBe(100);
    });

    it('should start down-stack when pressing decrease at base', () => {
      const result = service.decreasePrice(variantId, 100, 1, undefined, context);
      expect(result).not.toBeNull();
      expect(result!.newPrice).toBe(97);
    });
  });

  describe('decrease stack with wholesale floor', () => {
    const wholesale = 77;

    it('should build decrease path and stop at wholesale floor 77', () => {
      let current = 100;
      // 100→97→94→91→88→85→82→80→78→77 (rounded, capped at 77)
      const expected = [97, 94, 91, 88, 85, 82, 80, 78, 77];

      for (const exp of expected) {
        const result = service.decreasePrice(variantId, current, 1, wholesale, context);
        expect(result).not.toBeNull();
        current = result!.newPrice;
        expect(current).toBe(exp);
      }
      expect(current).toBe(77);
    });

    it('should return null when pressing DOWN at floor (77 with wholesale 77)', () => {
      let current = 100;
      while (current > 77) {
        const r = service.decreasePrice(variantId, current, 1, wholesale, context);
        current = r!.newPrice;
      }
      expect(current).toBe(77);
      const atFloor = service.decreasePrice(variantId, 77, 1, wholesale, context);
      expect(atFloor).toBeNull();
    });
  });

  describe('increase from down-stack (backtrack, pop only)', () => {
    it('should pop back 77 → 78 → 80 → ... → 100', () => {
      let current = 100;
      const downSteps = [97, 94, 91, 88, 85, 82, 80, 78, 77];
      for (const step of downSteps) {
        const r = service.decreasePrice(variantId, current, 1, 77, context);
        current = r!.newPrice;
      }
      expect(current).toBe(77);

      const upSequence = [78, 80, 82, 85, 88, 91, 94, 97, 100];
      for (const expected of upSequence) {
        const result = service.increasePrice(variantId, current, context);
        expect(result).not.toBeNull();
        current = result!.newPrice;
        expect(current).toBe(expected);
      }
      expect(current).toBe(100);
    });
  });

  describe('line context', () => {
    it('should use floor = wholesale * quantity (e.g. 77*2=154)', () => {
      const base = 200; // line total for 2 items
      const quantity = 2;
      const wholesalePerUnit = 77;
      const floor = 154;

      const r1 = service.decreasePrice(variantId, base, quantity, wholesalePerUnit, 'line');
      expect(r1).not.toBeNull();
      expect(r1!.newPrice).toBe(194); // 200*0.97

      let current = 194;
      while (current > floor) {
        const r = service.decreasePrice(variantId, current, quantity, wholesalePerUnit, 'line');
        if (!r) break;
        current = r.newPrice;
      }
      expect(current).toBe(154);
    });
  });

  describe('edge cases', () => {
    it('should allow decrease without wholesale (no floor)', () => {
      let current = 100;
      const r = service.decreasePrice(variantId, current, 1, undefined, context);
      expect(r).not.toBeNull();
      expect(r!.newPrice).toBe(97);
    });

    it('should reset state on clearStacks', () => {
      service.increasePrice(variantId, 100, context);
      service.increasePrice(variantId, 103, context);
      expect(service.getUndoStackLength(variantId, context)).toBe(2);

      service.clearStacks(variantId);
      expect(service.getUndoStackLength(variantId, context)).toBe(0);

      // Next call re-inits from current price
      const r = service.increasePrice(variantId, 100, context);
      expect(r).not.toBeNull();
      expect(r!.newPrice).toBe(103);
    });

    it('should isolate unit and line contexts', () => {
      service.increasePrice(variantId, 100, 'unit');
      service.increasePrice(variantId, 103, 'unit');
      expect(service.getUndoStackLength(variantId, 'unit')).toBe(2);
      expect(service.getUndoStackLength(variantId, 'line')).toBe(0);

      service.increasePrice(variantId, 200, 'line');
      expect(service.getUndoStackLength(variantId, 'line')).toBe(1);
    });
  });

  describe('isAtLowestPrice', () => {
    it('should return true when price per item <= wholesale', () => {
      expect(service.isAtLowestPrice(77, 1, 77)).toBe(true);
      expect(service.isAtLowestPrice(154, 2, 77)).toBe(true);
      expect(service.isAtLowestPrice(76, 1, 77)).toBe(true);
    });

    it('should return false when price per item > wholesale', () => {
      expect(service.isAtLowestPrice(78, 1, 77)).toBe(false);
      expect(service.isAtLowestPrice(100, 1, 77)).toBe(false);
    });

    it('should return false when no wholesale', () => {
      expect(service.isAtLowestPrice(50, 1, undefined)).toBe(false);
    });
  });

  describe('getUndoStackLength', () => {
    it('should return 0 at base', () => {
      expect(service.getUndoStackLength(variantId, context)).toBe(0);
    });

    it('should return stack length - 1 when above base', () => {
      service.increasePrice(variantId, 100, context);
      expect(service.getUndoStackLength(variantId, context)).toBe(1);
      service.increasePrice(variantId, 103, context);
      expect(service.getUndoStackLength(variantId, context)).toBe(2);
    });
  });
});
