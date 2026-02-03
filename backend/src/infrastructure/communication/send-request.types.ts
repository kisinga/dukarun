import { RequestContext } from '@vendure/core';

/**
 * Delivery channel for communication
 */
export type CommunicationChannel = 'sms' | 'email';

/**
 * Result of a single send operation
 */
export interface DeliveryResult {
  success: boolean;
  channel: CommunicationChannel;
  messageId?: string;
  error?: string;
}

/**
 * Request to send a message via the communication layer.
 * Used by OTP, admin alerts, welcome SMS, etc. so dev gating and channel selection happen in one place.
 */
export interface SendRequest {
  channel: CommunicationChannel;
  /** Recipient: phone number (E.164 or national format) for SMS, email address for email */
  recipient: string;
  /**
   * Body: for SMS a string message; for OTP email the OTP string (handler adds template vars).
   * For generic email, can be a string or record for template vars.
   */
  body: string | Record<string, unknown>;
  /** Optional template key (e.g. 'otp-verification') for email */
  template?: string;
  /** Required for email (Vendure EventBus/EmailPlugin need RequestContext) */
  ctx?: RequestContext;
  /** Optional metadata for dev logging (e.g. purpose: 'otp') */
  metadata?: { purpose?: string; [key: string]: unknown };
}
