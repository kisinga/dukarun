/**
 * SMS Provider Interface
 *
 * Defines the contract for SMS provider implementations.
 * This abstraction allows easy swapping of SMS providers (AfricasTalking, Twilio, AWS SNS, etc.)
 */

/**
 * Result of an SMS send operation
 */
export interface SmsResult {
  /**
   * Whether the SMS was sent successfully
   */
  success: boolean;

  /**
   * Provider-specific message ID (if available)
   */
  messageId?: string;

  /**
   * Error message if sending failed
   */
  error?: string;

  /**
   * Provider-specific metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Configuration for SMS providers
 * Each provider can extend this with provider-specific fields
 */
export interface SmsProviderConfig {
  /**
   * Provider name/identifier
   */
  provider: string;

  /**
   * Provider-specific configuration
   */
  [key: string]: any;
}

/**
 * SMS Provider Interface
 *
 * All SMS providers must implement this interface to ensure consistent behavior
 * across different SMS services.
 */
export interface ISmsProvider {
  /**
   * Send an SMS message to a phone number
   *
   * @param phoneNumber - Phone number in any format (will be normalized by provider if needed)
   * @param message - Message content to send
   * @param isOtp - Optional flag indicating if this is an OTP message (for routing to dedicated endpoints)
   * @returns Promise resolving to SmsResult indicating success/failure
   */
  sendSms(phoneNumber: string, message: string, isOtp?: boolean): Promise<SmsResult>;

  /**
   * Get the provider name/identifier
   */
  getName(): string;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}
