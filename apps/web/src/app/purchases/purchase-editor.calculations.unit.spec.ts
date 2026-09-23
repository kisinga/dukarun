import { describe, expect, it } from 'vitest';
import {
  buildPurchaseExpenseInputs,
  buildPurchaseLineInputs,
  purchaseLineTaxBreakdown,
  purchaseLineEnteredAmount,
  purchasePaymentProjection,
  purchaseTaxBreakdown,
} from './purchase-editor.calculations';

const line = {
  key: 1,
  variantId: 'variant-1',
  quantity: 3,
  unitCost: '33.33',
  lineTotal: '100',
  valueSource: 'total' as const,
  batchNumber: '',
  expiryDate: '',
  wholesalePrice: '40',
  retailPrice: '50',
  expanded: false,
  error: null,
  defaultCostNeedsConversion: false,
};

describe('purchase editor calculations', () => {
  it('rounds VAT once at the invoice line boundary for odd quantities', () => {
    const breakdown = purchaseLineTaxBreakdown(line, 1600, 'exclusive');
    expect(breakdown).toEqual({ entered: 100, net: 100, tax: 16, gross: 116, rateBps: 1600 });

    const [payload] = buildPurchaseLineInputs({
      lines: [line],
      breakdowns: new Map([[1, breakdown]]),
      basis: 'exclusive',
      variants: new Map([
        ['variant-1', { variant_id: 'variant-1', wholesale_price: 40, price: 50 } as never],
      ]),
      includeExpiry: false,
      canAdjustPrices: true,
    });
    expect(payload.line_total).toBe(116);
    expect(payload.unit_cost).toBe(38.67);
    expect(payload.entered_unit_cost).toBe(33.33);
    expect(payload.entered_line_total).toBe(100);
  });

  it.each([
    ['2.50', 250],
    ['0.25', 25],
  ] as const)('multiplies a %s buying rate before rounding the posted total', (unitCost, total) => {
    const purchaseLine = {
      ...line,
      quantity: 100,
      unitCost,
      lineTotal: String(total),
      valueSource: 'unit' as const,
    };
    expect(purchaseLineEnteredAmount(purchaseLine)).toBe(total);
    const breakdown = purchaseLineTaxBreakdown(purchaseLine, 0, 'inclusive');
    const [payload] = buildPurchaseLineInputs({
      lines: [purchaseLine],
      breakdowns: new Map([[1, breakdown]]),
      basis: 'inclusive',
      variants: new Map([['variant-1', { variant_id: 'variant-1' } as never]]),
      includeExpiry: false,
      canAdjustPrices: false,
    });
    expect(payload.unit_cost).toBe(Number(unitCost));
    expect(payload.line_total).toBe(total);
  });

  it('keeps pack buying rates and exact line totals separate from base-stock rates', () => {
    const purchaseLine = {
      ...line,
      quantity: 1,
      unitCost: '250',
      lineTotal: '250',
      valueSource: 'unit' as const,
      packId: 'box',
      unitsPerUnit: 100,
      unitName: 'box',
    };
    const breakdown = purchaseLineTaxBreakdown(purchaseLine, 0, 'inclusive');
    const [payload] = buildPurchaseLineInputs({
      lines: [purchaseLine],
      breakdowns: new Map([[1, breakdown]]),
      basis: 'inclusive',
      variants: new Map([['variant-1', { variant_id: 'variant-1' } as never]]),
      includeExpiry: false,
      canAdjustPrices: false,
    });
    expect(payload).toMatchObject({
      unit_cost: 250,
      line_total: 250,
      quantity: 1,
      units_per_unit: 100,
    });
    expect(payload.unit_cost / payload.units_per_unit!).toBe(2.5);
    expect(
      purchaseLineEnteredAmount({ ...line, quantity: 3, unitCost: '2.5', valueSource: 'unit' })
    ).toBe(8);
  });

  it('preserves entered expense values while persisting the computed gross supplier cost', () => {
    const expense = {
      key: 2,
      category: 'transport',
      customCategory: '',
      memo: '',
      amount: '100',
      settlement: 'supplier_bill' as const,
      accountCode: '',
      noteExpanded: false,
      error: null,
    };
    const breakdown = purchaseTaxBreakdown(100, 1600, 'exclusive');
    const [payload] = buildPurchaseExpenseInputs({
      expenses: [expense],
      breakdowns: new Map([[2, breakdown]]),
      basis: 'exclusive',
    });
    expect(payload.amount).toBe(116);
    expect(payload.entered_amount).toBe(100);
  });

  it('projects mixed advance, partial payment, and separate expenses without double counting', () => {
    expect(
      purchasePaymentProjection({
        invoiceTotal: 1_000,
        separateExpenseTotal: 100,
        advanceAmount: 250,
        paymentMode: 'partial',
        partialAmount: 300,
      })
    ).toEqual({ initialPayment: 300, balanceDue: 450, cashLeavingNow: 400 });
  });
});
