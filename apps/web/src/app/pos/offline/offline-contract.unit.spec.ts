import { describe, expect, it } from 'vitest';
import {
  confirmedOfflineTime,
  parseOfflineResult,
  type OfflineConfirmation,
} from './offline-contract';

describe('offline confirmation', () => {
  const received = Date.parse('2026-09-29T09:00:00Z');
  const confirmation: OfflineConfirmation = {
    clock: { serverTime: Date.parse('2026-09-29T08:00:00Z'), observedAt: received },
    context: {
      id: 'context',
      company_id: 'company',
      user_id: 'cashier',
      location_id: 'shop',
      session_id: 'session',
      device_key: 'device',
      issued_at: '2026-09-29T08:00:00Z',
      expires_at: '2026-09-30T08:00:00Z',
    },
  };
  it('uses server time despite an inaccurate device clock and works across midnight', () => {
    expect(confirmedOfflineTime(confirmation, confirmation.clock.serverTime + 20 * 3600000)).toBe(
      Date.parse('2026-09-30T04:00:00Z')
    );
  });
  it('expires exactly at 24 hours and rejects a backwards clock', () => {
    expect(
      confirmedOfflineTime(confirmation, confirmation.clock.serverTime + 24 * 3600000 - 1)
    ).not.toBeNull();
    expect(
      confirmedOfflineTime(confirmation, confirmation.clock.serverTime + 24 * 3600000)
    ).toBeNull();
    expect(confirmedOfflineTime(confirmation, confirmation.clock.serverTime - 1)).toBeNull();
    expect(confirmedOfflineTime(null, null)).toBeNull();
  });
});

describe('offline posting outcomes', () => {
  it.each(['waiting', 'review', 'approval', 'failed', 'cancelled'])(
    'accepts explicit durable %s without calling it completed',
    status => {
      expect(
        parseOfflineResult({
          status,
          durable_custody: true,
          review_id: 'review',
          order_id: null,
          blockers: [],
        }).status
      ).toBe(status);
    }
  );
  it.each([
    null,
    {},
    { status: 'success' },
    { status: 'completed', durable_custody: true, review_id: 'r', blockers: [] },
    { status: 'review', review_id: 'r', blockers: [] },
  ])('retains a request after an ambiguous response %j', result => {
    expect(() => parseOfflineResult(result)).toThrow('queued request has been kept');
  });
});
