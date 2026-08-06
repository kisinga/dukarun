/**
 * Shared types for basic info forms
 */

export interface PhoneCheckResult {
  exists: boolean;
  isSupplier: boolean;
  customerName?: string;
}

export type PhoneCheckFn = (phoneNumber: string) => Promise<PhoneCheckResult>;

export type ValidationState =
  | 'idle'
  | 'checking'
  | 'valid'
  | 'invalid_duplicate'
  | 'invalid_format'
  | 'invalid_required';
