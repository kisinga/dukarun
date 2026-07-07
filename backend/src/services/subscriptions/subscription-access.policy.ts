export type SubscriptionAccess = 'full' | 'read_only';

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
  canPerformAction: boolean;
  exemptionEndsAt?: Date;
  exemptionReason?: string;
}

type SubscriptionFields = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;

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
    return readOnlyDecision({
      status: 'expired',
      reason: hasExpiredExemption ? 'expired_exemption' : 'trial_expired',
      trialEndsAt,
      expiresAt: trialEndsAt,
      exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
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
    return readOnlyDecision({
      status: 'expired',
      reason: hasExpiredExemption ? 'expired_exemption' : 'active_expired',
      expiresAt,
      exemptionEndsAt: hasExpiredExemption ? exemptUntil : undefined,
    });
  }

  if (status === 'cancelled') {
    return readOnlyDecision({ status: 'cancelled', reason: 'cancelled' });
  }

  if (status === 'expired') {
    const expiresAt = parseDate(customFields.subscriptionExpiresAt);
    if (expiresAt && expiresAt <= now) {
      return readOnlyDecision({ status: 'expired', reason: 'active_expired', expiresAt });
    }
    const trialEndsAt = parseDate(customFields.trialEndsAt);
    if (trialEndsAt && trialEndsAt <= now) {
      return readOnlyDecision({
        status: 'expired',
        reason: 'trial_expired',
        trialEndsAt,
        expiresAt: trialEndsAt,
      });
    }
    return readOnlyDecision({ status: 'expired', reason: 'unknown_status' });
  }

  return readOnlyDecision({ status: 'expired', reason: 'unknown_status' });
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'trial';
}

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

function fullDecision(
  input: Omit<SubscriptionAccessDecision, 'access' | 'isValid' | 'canWrite' | 'canPerformAction'>
): SubscriptionAccessDecision {
  return {
    ...input,
    access: 'full',
    isValid: true,
    canWrite: true,
    canPerformAction: true,
  };
}

function readOnlyDecision(
  input: Omit<SubscriptionAccessDecision, 'access' | 'isValid' | 'canWrite' | 'canPerformAction'>
): SubscriptionAccessDecision {
  return {
    ...input,
    access: 'read_only',
    isValid: false,
    canWrite: false,
    canPerformAction: false,
  };
}
