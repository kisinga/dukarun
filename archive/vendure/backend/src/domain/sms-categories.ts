/**
 * SMS categories for type-scoped counts and optional per-category limits.
 * Used when recording usage and when checking limits (only counted categories apply).
 */
export type SmsCategory =
  | 'OTP'
  | 'NOTIFICATION'
  | 'WELCOME'
  | 'MARKETING'
  | 'TRANSACTIONAL'
  | 'ACCOUNT_NOTIFICATION'
  | 'ADMIN';

/** Categories that count toward the channel's SMS tier limit. OTP and ADMIN do not. */
export const COUNTED_SMS_CATEGORIES: ReadonlySet<SmsCategory> = new Set([
  'NOTIFICATION',
  'WELCOME',
  'MARKETING',
  'TRANSACTIONAL',
  'ACCOUNT_NOTIFICATION',
]);

export function isCountedCategory(category: SmsCategory): boolean {
  return COUNTED_SMS_CATEGORIES.has(category);
}

const PURPOSE_TO_CATEGORY: Record<string, SmsCategory> = {
  otp: 'OTP',
  welcome_sms: 'WELCOME',
  admin_notification: 'ADMIN',
  account_notification: 'ACCOUNT_NOTIFICATION',
};

/**
 * Resolve SMS category from SendRequest metadata or explicit smsCategory.
 */
export function resolveSmsCategory(purpose?: string, explicitCategory?: SmsCategory): SmsCategory {
  if (explicitCategory) return explicitCategory;
  if (purpose && purpose in PURPOSE_TO_CATEGORY) return PURPOSE_TO_CATEGORY[purpose];
  return 'NOTIFICATION';
}

export type SmsUsageByCategory = Partial<Record<SmsCategory, number>>;
