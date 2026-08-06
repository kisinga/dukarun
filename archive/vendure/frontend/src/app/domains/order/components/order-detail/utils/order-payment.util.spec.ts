import { getOrderAmountOwing } from './order-payment.util';

describe('order payment utilities', () => {
  it('calculates the remaining amount after settled payments', () => {
    expect(
      getOrderAmountOwing({
        state: 'ArrangingPayment',
        totalWithTax: 15000,
        payments: [
          { state: 'Settled', amount: 5000 },
          { state: 'Declined', amount: 3000 },
        ],
      }),
    ).toBe(10000);
  });

  it('never returns a negative amount owing', () => {
    expect(
      getOrderAmountOwing({
        state: 'PaymentSettled',
        totalWithTax: 5000,
        payments: [{ state: 'Settled', amount: 6000 }],
      }),
    ).toBe(0);
  });

  it('excludes draft, cancelled, and reversed orders', () => {
    expect(getOrderAmountOwing({ state: 'Draft', totalWithTax: 5000 })).toBe(0);
    expect(getOrderAmountOwing({ state: 'Cancelled', totalWithTax: 5000 })).toBe(0);
    expect(
      getOrderAmountOwing({
        state: 'ArrangingPayment',
        totalWithTax: 5000,
        customFields: { reversedAt: '2026-07-01T00:00:00.000Z' },
      }),
    ).toBe(0);
  });
});
