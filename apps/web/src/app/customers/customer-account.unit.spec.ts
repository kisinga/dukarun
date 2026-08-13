import { describe, expect, it } from 'vitest';
import { customerAccountState, planCustomerReceipt } from './customer-account';

const invoices = [
  { id: 'b', code: 'INV-2', outstanding: 200, created_at: '2026-02-01T00:00:00Z' },
  { id: 'a', code: 'INV-1', outstanding: 100, created_at: '2026-01-01T00:00:00Z' },
];

describe('planCustomerReceipt', () => {
  it('allocates FIFO and exposes an overpayment as downpayment', () => {
    expect(planCustomerReceipt(350, invoices)).toEqual({
      applied: 300,
      excess: 50,
      allocations: [
        { code: 'INV-1', amount: 100, clearsInvoice: true },
        { code: 'INV-2', amount: 200, clearsInvoice: true },
      ],
      hiddenAllocations: 0,
      clearedInvoices: 2,
    });
  });

  it('keeps a single exact allocation concise', () => {
    expect(planCustomerReceipt(100, invoices)).toBeNull();
  });

  it('previews a pure downpayment when no invoices are open', () => {
    expect(planCustomerReceipt(75, [])).toMatchObject({ applied: 0, excess: 75 });
  });
});

describe('customerAccountState', () => {
  it.each([
    [120, 'Amount due'],
    [-120, 'Downpayment available'],
    [0, 'Settled'],
  ])('maps signed balance %s to %s', (balance, label) => {
    expect(customerAccountState(balance)).toBe(label);
  });
});
