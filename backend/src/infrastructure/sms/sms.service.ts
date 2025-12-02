import { Injectable, Logger } from '@nestjs/common';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { ISmsProvider, SmsResult } from './interfaces/sms-provider.interface';
import { SmsProviderFactory } from './sms-provider.factory';
import { env } from '../config/environment.config';

/**
 * SMS Service
 *
 * High-level service for sending SMS messages.
 * Handles phone number normalization and delegates to configured SMS provider.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private provider: ISmsProvider;

  constructor(private readonly providerFactory: SmsProviderFactory) {
    // Get the active provider from factory
    this.provider = this.providerFactory.getProvider();
  }

  /**
   * Send an SMS message to a phone number
   *
   * @param phoneNumber - Phone number in any format (will be normalized)
   * @param message - Message content to send
   * @param isOtp - Optional flag indicating if this is an OTP message (for routing to dedicated endpoints)
   * @returns Promise resolving to SmsResult indicating success/failure
   */
  async sendSms(phoneNumber: string, message: string, isOtp?: boolean): Promise<SmsResult> {
    try {
      // In development mode, print SMS to console instead of sending
      if (env.isDevelopment()) {
        const normalizedPhone = formatPhoneNumber(phoneNumber);
        this.logger.log('📱 [DEV MODE] SMS would be sent:');
        this.logger.log(`   To: ${normalizedPhone}`);
        this.logger.log(`   Message: ${message}`);
        return {
          success: true,
          messageId: 'dev-mode-mock',
          metadata: {
            devMode: true,
            phoneNumber: normalizedPhone,
            message,
          },
        };
      }

      // Normalize phone number to standard format (07XXXXXXXX)
      const normalizedPhone = formatPhoneNumber(phoneNumber);

      // Check if provider is configured
      if (!this.provider.isConfigured()) {
        // Get detailed configuration status for better error messages
        const configStatus = (this.provider as any).getConfigurationStatus?.() || { missing: [] };
        const missingVars =
          configStatus.missing?.length > 0 ? ` Missing: ${configStatus.missing.join(', ')}` : '';

        this.logger.warn(`Provider "${this.provider.getName()}" is not configured.${missingVars}`);
        return {
          success: false,
          error: `SMS provider "${this.provider.getName()}" is not configured.${missingVars}`,
        };
      }

      // Delegate to provider
      const result = await this.provider.sendSms(normalizedPhone, message, isOtp);

      // Log result
      if (result.success) {
        this.logger.log(
          `SMS sent successfully via ${this.provider.getName()} to ${normalizedPhone}`
        );
      } else {
        this.logger.error(
          `Failed to send SMS via ${this.provider.getName()} to ${normalizedPhone}: ${result.error}`
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Error sending SMS: ${errorMessage}`, error);

      return {
        success: false,
        error: `SMS service error: ${errorMessage}`,
      };
    }
  }

  /**
   * Get the active provider name (for debugging/logging)
   */
  getProviderName(): string {
    return this.provider.getName();
  }

  /**
   * Check if the active provider is configured
   */
  isConfigured(): boolean {
    return this.provider.isConfigured();
  }
}
