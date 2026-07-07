import { describe, expect, it } from '@jest/globals';
import { evaluateSubscriptionAccess } from '../../../src/services/subscriptions/subscription-access.policy';

describe('evaluateSubscriptionAccess', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');

  it('allows a valid trial', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'trial', trialEndsAt: '2026-07-14T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('full');
    expect(result.status).toBe('trial');
    expect(result.reason).toBe('trial_valid');
    expect(result.canWrite).toBe(true);
  });

  it('blocks an expired trial', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'trial', trialEndsAt: '2026-07-01T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('trial_expired');
    expect(result.canWrite).toBe(false);
  });

  it('allows an active paid subscription', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'active', subscriptionExpiresAt: '2026-08-07T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('full');
    expect(result.status).toBe('active');
    expect(result.reason).toBe('active_valid');
  });

  it('blocks an expired paid subscription', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'active', subscriptionExpiresAt: '2026-07-01T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('active_expired');
  });

  it('blocks a missing date without exemption', () => {
    const result = evaluateSubscriptionAccess({ subscriptionStatus: 'trial' }, now);

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('trial');
    expect(result.reason).toBe('missing_trial_end');
  });

  it('allows a valid exemption', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'trial',
        subscriptionExemptUntil: '2026-07-21T12:00:00.000Z',
        subscriptionExemptReason: 'pilot merchant',
      },
      now
    );

    expect(result.access).toBe('full');
    expect(result.status).toBe('exempt');
    expect(result.reason).toBe('explicit_exemption');
    expect(result.exemptionReason).toBe('pilot merchant');
  });

  it('blocks an expired exemption', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'trial',
        subscriptionExemptUntil: '2026-07-01T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.reason).toBe('expired_exemption');
  });

  it('blocks cancelled subscriptions', () => {
    const result = evaluateSubscriptionAccess({ subscriptionStatus: 'cancelled' }, now);

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('cancelled');
    expect(result.reason).toBe('cancelled');
  });
});
