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
    expect(result.canRead).toBe(true);
  });

  it('allows read-only access during the grace period after an expired trial', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'trial',
        trialEndsAt: '2026-07-01T12:00:00.000Z',
        subscriptionGracePeriodEnd: '2026-07-14T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('trial_expired');
    expect(result.canWrite).toBe(false);
    expect(result.canRead).toBe(true);
    expect(result.gracePeriodEnd).toEqual(new Date('2026-07-14T12:00:00.000Z'));
  });

  it('blocks an expired trial once the grace period has ended', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'trial',
        trialEndsAt: '2026-07-01T12:00:00.000Z',
        subscriptionGracePeriodEnd: '2026-07-05T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('blocked');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('grace_period_ended');
    expect(result.canWrite).toBe(false);
    expect(result.canRead).toBe(false);
  });

  it('derives a grace period when none is set for a recently expired trial', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'trial', trialEndsAt: '2026-07-01T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('trial_expired');
    expect(result.canRead).toBe(true);
    expect(result.gracePeriodEnd).toEqual(new Date('2026-07-15T12:00:00.000Z'));
  });

  it('blocks an expired trial whose derived grace period has ended', () => {
    const result = evaluateSubscriptionAccess(
      { subscriptionStatus: 'trial', trialEndsAt: '2026-06-01T12:00:00.000Z' },
      now
    );

    expect(result.access).toBe('blocked');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('grace_period_ended');
    expect(result.canRead).toBe(false);
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

  it('allows read-only access during the grace period after an expired paid subscription', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: '2026-07-01T12:00:00.000Z',
        subscriptionGracePeriodEnd: '2026-07-14T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('expired');
    expect(result.reason).toBe('active_expired');
  });

  it('blocks an expired paid subscription once the grace period has ended', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: '2026-07-01T12:00:00.000Z',
        subscriptionGracePeriodEnd: '2026-07-05T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('blocked');
    expect(result.reason).toBe('grace_period_ended');
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

  it('derives grace from exemption end instead of old expiry date', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: '2026-06-01T12:00:00.000Z',
        subscriptionExemptUntil: '2026-07-05T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.reason).toBe('expired_exemption');
    expect(result.gracePeriodEnd).toEqual(new Date('2026-07-19T12:00:00.000Z'));
  });

  it('ignores a stale persisted grace period when an expired exemption is present', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: '2026-06-01T12:00:00.000Z',
        subscriptionExemptUntil: '2026-07-05T12:00:00.000Z',
        // A previously-computed grace period from the old expiry date must not
        // override the exemption-based grace period.
        subscriptionGracePeriodEnd: '2026-06-15T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.reason).toBe('expired_exemption');
    expect(result.gracePeriodEnd).toEqual(new Date('2026-07-19T12:00:00.000Z'));
  });

  it('blocks cancelled subscriptions after the grace period', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'cancelled',
        subscriptionGracePeriodEnd: '2026-07-05T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('blocked');
    expect(result.status).toBe('cancelled');
    expect(result.reason).toBe('grace_period_ended');
  });

  it('allows read-only access for cancelled subscriptions during the grace period', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'cancelled',
        subscriptionGracePeriodEnd: '2026-07-14T12:00:00.000Z',
      },
      now
    );

    expect(result.access).toBe('read_only');
    expect(result.status).toBe('cancelled');
    expect(result.reason).toBe('cancelled');
  });

  it('reports days remaining until the grace period ends', () => {
    const result = evaluateSubscriptionAccess(
      {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: '2026-07-01T12:00:00.000Z',
        subscriptionGracePeriodEnd: '2026-07-14T12:00:00.000Z',
      },
      now
    );

    expect(result.daysRemaining).toBe(7);
  });
});
