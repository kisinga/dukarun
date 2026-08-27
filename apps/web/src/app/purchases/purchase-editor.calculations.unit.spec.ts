import { describe, expect, it } from 'vitest';
import {
  buildPurchaseExpenseInputs,
  buildPurchaseLineInputs,
  purchaseLineTaxBreakdown,
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
    expect(payload.unit_cost).toBe(39);
    expect(payload.entered_line_total).toBe(100);
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
