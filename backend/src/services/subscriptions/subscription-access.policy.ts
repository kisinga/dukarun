export type SubscriptionAccess = 'full' | 'read_only' | 'blocked';

export type SubscriptionPolicyStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'exempt';

export type SubscriptionPolicyReason =
  | 'trial_valid'
  | 'trial_expired'
  | 'active_valid'
  | 'active_expired'
  | 'cancelled'
  | 'explicit_exemption'
  | 'expired_exemption'
  | 'missing_trial_end'
  | 'missing_subscription_expiry'
  | 'grace_period_ended'
  | 'unknown_status';

export interface SubscriptionAccessDecision {
  isValid: boolean;
  access: SubscriptionAccess;
  status: SubscriptionPolicyStatus;
  reason: SubscriptionPolicyReason;
  daysRemaining?: number;
  expiresAt?: Date;
  trialEndsAt?: Date;
  canWrite: boolean;
  canRead: boolean;
  canPerformAction: boolean;
  exemptionEndsAt?: Date;
  exemptionReason?: string;
  gracePeriodEnd?: Date;
}

type SubscriptionFields = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 14;

export function evaluateSubscriptionAccess(
  fields: SubscriptionFields | null | undefined,
  now = new Date()
): SubscriptionAccessDecision {
  const customFields = fields ?? {};
  const status = normalizeStatus(customFields.subscriptionStatus);
  const exemptUntil = parseDate(customFields.subscriptionExemptUntil);
  const hasExpiredExemption = !!exemptUntil && exemptUntil <= now;

  if (exemptUntil) {
    const exemptionReason =
      typeof customFields.subscriptionExemptReason === 'string'
        ? customFields.subscriptionExemptReason.trim() || undefined
        : undefined;

    if (exemptUntil > now) {
      return fullDecision({
        status: 'exempt',
        reason: 'explicit_exemption',
        expiresAt: exemptUntil,
        exemptionEndsAt: exemptUntil,
        exemptionReason,
        daysRemaining: daysUntil(exemptUntil, now),
      });
    }
  }

  if (status === 'trial') {
    const trialEndsAt = parseDate(customFields.trialEndsAt);
    if (!trialEndsAt) {
      return readOnlyDecision({
        status: 'trial',
        reason: hasExpiredExemption ? 'expired_exemption' : 'missing_trial_end',
        exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
      });
    }
    if (trialEndsAt > now) {
      return fullDecision({
        status: 'trial',
        reason: 'trial_valid',
        trialEndsAt,
        expiresAt: trialEndsAt,
        daysRemaining: daysUntil(trialEndsAt, now),
      });
    }
    return resolveExpiredDecision({
      status: 'expired',
      reason: hasExpiredExemption ? 'expired_exemption' : 'trial_expired',
      trialEndsAt,
      expiresAt: trialEndsAt,
      exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
      gracePeriodEnd: parseDate(customFields.subscriptionGracePeriodEnd),
      now,
    });
  }

  if (status === 'active') {
    const expiresAt = parseDate(customFields.subscriptionExpiresAt);
    if (!expiresAt) {
      return readOnlyDecision({
        status: 'active',
        reason: hasExpiredExemption ? 'expired_exemption' : 'missing_subscription_expiry',
        exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
      });
    }
    if (expiresAt > now) {
      return fullDecision({
        status: 'active',
        reason: 'active_valid',
        expiresAt,
        daysRemaining: daysUntil(expiresAt, now),
      });
    }
    return resolveExpiredDecision({
      status: 'expired',
      reason: hasExpiredExemption ? 'expired_exemption' : 'active_expired',
      expiresAt,
      exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
      gracePeriodEnd: parseDate(customFields.subscriptionGracePeriodEnd),
      now,
    });
  }

  if (status === 'cancelled') {
    return resolveExpiredDecision({
      status: 'cancelled',
      reason: 'cancelled',
      gracePeriodEnd: parseDate(customFields.subscriptionGracePeriodEnd),
      now,
    });
  }

  if (status === 'expired') {
    const expiresAt = parseDate(customFields.subscriptionExpiresAt);
    const trialEndsAt = parseDate(customFields.trialEndsAt);
    return resolveExpiredDecision({
      status: 'expired',
      reason: hasExpiredExemption
        ? 'expired_exemption'
        : expiresAt
          ? 'active_expired'
          : trialEndsAt
            ? 'trial_expired'
            : 'unknown_status',
      expiresAt: expiresAt ?? trialEndsAt,
      trialEndsAt,
      exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
      gracePeriodEnd: parseDate(customFields.subscriptionGracePeriodEnd),
      now,
    });
  }

  return blockedDecision({
    status: 'expired',
    reason: 'unknown_status',
  });
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'trial';
}

export function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

function resolveExpiredDecision(
  input: Omit<
    SubscriptionAccessDecision,
    'access' | 'isValid' | 'canWrite' | 'canRead' | 'canPerformAction'
  > & { gracePeriodEnd?: Date; now: Date }
): SubscriptionAccessDecision {
  const { gracePeriodEnd, now, ...rest } = input;
  const isExpiredExemption = rest.reason === 'expired_exemption' && !!rest.exemptionEndsAt;
  const expiredExemptionEnd = isExpiredExemption ? rest.exemptionEndsAt : undefined;
  const graceBaseDate = expiredExemptionEnd ?? rest.expiresAt ?? rest.trialEndsAt;
  // A stale persisted grace period must not override the exemption end date for an
  // expired exemption; otherwise the grace period would be derived from the old
  // subscription expiry instead of the exemption that was meant to cover it.
  const effectiveGraceEnd =
    gracePeriodEnd && !isExpiredExemption
      ? gracePeriodEnd
      : graceBaseDate
        ? new Date(graceBaseDate.getTime() + GRACE_PERIOD_DAYS * DAY_MS)
        : undefined;
  if (effectiveGraceEnd && effectiveGraceEnd > now) {
    return readOnlyDecision({
      ...rest,
      gracePeriodEnd: effectiveGraceEnd,
      daysRemaining: daysUntil(effectiveGraceEnd, now),
    });
  }
  return blockedDecision({
    ...rest,
    reason: effectiveGraceEnd ? 'grace_period_ended' : rest.reason,
    gracePeriodEnd: effectiveGraceEnd,
  });
}

function fullDecision(
  input: Omit<
    SubscriptionAccessDecision,
    'access' | 'isValid' | 'canWrite' | 'canRead' | 'canPerformAction'
  >
): SubscriptionAccessDecision {
  return {
    ...input,
    access: 'full',
    isValid: true,
    canWrite: true,
    canRead: true,
    canPerformAction: true,
  };
}

function readOnlyDecision(
  input: Omit<
    SubscriptionAccessDecision,
    'access' | 'isValid' | 'canWrite' | 'canRead' | 'canPerformAction'
  >
): SubscriptionAccessDecision {
  return {
    ...input,
    access: 'read_only',
    isValid: false,
    canWrite: false,
    canRead: true,
    canPerformAction: false,
  };
}

function blockedDecision(
  input: Omit<
    SubscriptionAccessDecision,
    'access' | 'isValid' | 'canWrite' | 'canRead' | 'canPerformAction'
  >
): SubscriptionAccessDecision {
  return {
    ...input,
    access: 'blocked',
    isValid: false,
    canWrite: false,
    canRead: false,
    canPerformAction: false,
  };
}

export function getDefaultGracePeriodEnd(now = new Date()): Date {
  return new Date(now.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}
