export interface PaidAccessState {
  subscription_status: string | null;
  subscription_expires_at: string | null;
  subscription_grace_period_end: string | null;
  subscription_exempt_until: string | null;
}

export function hasPaidAccess(company: PaidAccessState, now = Date.now()): boolean {
  return (
    (company.subscription_exempt_until !== null &&
      Date.parse(company.subscription_exempt_until) > now) ||
    (company.subscription_status === 'active' &&
      company.subscription_expires_at !== null &&
      Date.parse(company.subscription_expires_at) > now) ||
    (company.subscription_status === 'expired' &&
      company.subscription_grace_period_end !== null &&
      Date.parse(company.subscription_grace_period_end) > now)
  );
}
