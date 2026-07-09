import { describe, expect, it } from '@jest/globals';
import { renderOutbound } from '../../../src/services/notifications/outbound.render';

describe('outbound.render shift_opened', () => {
  it('renders a formatted WhatsApp body with store, cashier, and opening balances', () => {
    const result = renderOutbound('shift_opened', {
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      openingBalances: [
        {
          accountCode: 'CASH_ON_HAND',
          declaredCents: 500000,
          expectedCents: 500000,
          varianceCents: 0,
        },
        { accountCode: 'CLEARING_MPESA', declaredCents: 0, expectedCents: 0, varianceCents: 0 },
      ],
      totalOpeningVariance: 0,
    });

    expect(result.whatsappBody).toContain('🟢 *Shift Opened — ABC Store*');
    expect(result.whatsappBody).toContain('*Cashier:* John Doe');
    expect(result.whatsappBody).toContain('*Opened:*');
    expect(result.whatsappBody).toContain('CASH ON HAND: KES 5,000.00');
    expect(result.whatsappBody).toContain(
      'https://dukarun.com/dashboard/accounting?sessionId=session-1'
    );
    expect(result.whatsappBody).toContain('— DukaRun Shift Report');
  });

  it('shows opening variance when present', () => {
    const result = renderOutbound('shift_opened', {
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      openingBalances: [
        {
          accountCode: 'CASH_ON_HAND',
          declaredCents: 480000,
          expectedCents: 500000,
          varianceCents: -20000,
        },
      ],
      totalOpeningVariance: -20000,
    });

    expect(result.whatsappBody).toContain('*Opening variance:* KES 200.00 short');
  });
});

describe('outbound.render shift_closed', () => {
  it('renders a balanced close with green emoji', () => {
    const result = renderOutbound('shift_closed', {
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      closedAt: '2026-07-09T17:45:00.000Z',
      cashSales: 400000,
      creditSales: 100000,
      purchases: 50000,
      cashTotal: 400000,
      mpesaTotal: 0,
      totalCollected: 400000,
      closingDeclared: 900000,
      variance: 0,
      varianceThresholdCents: 10000,
    });

    expect(result.whatsappBody).toContain('🟢 *Shift Closed — ABC Store*');
    expect(result.whatsappBody).toContain('*Total sales:* KES 5,000.00');
    expect(result.whatsappBody).toContain('*Cashier:* John Doe');
    expect(result.whatsappBody).toContain('*Duration:* 9h 22m');
    expect(result.whatsappBody).toContain('*Variance:* None 🟢');
  });

  it('uses yellow emoji for small variance and red for large variance', () => {
    const small = renderOutbound('shift_closed', {
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      closedAt: '2026-07-09T17:45:00.000Z',
      cashSales: 0,
      creditSales: 0,
      purchases: 0,
      cashTotal: 0,
      mpesaTotal: 0,
      totalCollected: 0,
      closingDeclared: 0,
      variance: -5000,
      varianceThresholdCents: 10000,
    });

    const large = renderOutbound('shift_closed', {
      sessionId: 'session-1',
      storeName: 'ABC Store',
      cashierName: 'John Doe',
      openedAt: '2026-07-09T08:23:00.000Z',
      closedAt: '2026-07-09T17:45:00.000Z',
      cashSales: 0,
      creditSales: 0,
      purchases: 0,
      cashTotal: 0,
      mpesaTotal: 0,
      totalCollected: 0,
      closingDeclared: 0,
      variance: -50000,
      varianceThresholdCents: 10000,
    });

    expect(small.whatsappBody).toContain('🟡 *Shift Closed — ABC Store*');
    expect(small.whatsappBody).toContain('KES 50.00 short');
    expect(large.whatsappBody).toContain('🔴 *Shift Closed — ABC Store*');
    expect(large.whatsappBody).toContain('KES 500.00 short');
  });
});
