import { describe, expect, it } from 'vitest';
import { hasPaidAccess, type PaidAccessState } from './paid-access';

const now = Date.parse('2026-08-20T12:00:00Z');

function state(overrides: Partial<PaidAccessState> = {}): PaidAccessState {
  return {
    subscription_status: null,
    subscription_expires_at: null,
    subscription_grace_period_end: null,
    subscription_exempt_until: null,
    ...overrides,
  };
}

describe('hasPaidAccess', () => {
  it('blocks an approved company before its first payment', () => {
    expect(hasPaidAccess(state(), now)).toBe(false);
  });

  it('allows only active subscriptions with a future expiry', () => {
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'active',
          subscription_expires_at: '2026-08-21T12:00:00Z',
        }),
        now
      )
    ).toBe(true);
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'active',
          subscription_expires_at: '2026-08-19T12:00:00Z',
        }),
        now
      )
    ).toBe(false);
  });

  it('honors a future grace period or explicit exemption', () => {
    expect(
      hasPaidAccess(
        state({
          subscription_status: 'expired',
          subscription_grace_period_end: '2026-08-21T12:00:00Z',
        }),
        now
      )
    ).toBe(true);
    expect(hasPaidAccess(state({ subscription_exempt_until: '2026-08-21T12:00:00Z' }), now)).toBe(
      true
    );
  });
});
