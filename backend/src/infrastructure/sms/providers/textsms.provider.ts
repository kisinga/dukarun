import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, SmsResult } from '../interfaces/sms-provider.interface';
import { env } from '../../config/environment.config';

/**
 * TextSMS SMS Provider
 *
 * Implements SMS sending via TextSMS Bulk SMS API
 * API Documentation: https://textsms.co.ke/bulk-sms-api/
 *
 * OTP messages are automatically routed to the dedicated OTP endpoint
 * (/api/services/sendotp/) which handles sensitive transaction traffic.
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Create Account:
 *    - Sign up at https://textsms.co.ke
 *    - Activate your account
 *
 * 2. Get API Credentials:
 *    - Log in to your TextSMS account
 *    - Navigate to account settings and click "GET API KEY & PARTNER ID"
 *    - Note down your API Key and Partner ID
 *    - Set TEXTSMS_API_KEY in your .env file
 *    - Set TEXTSMS_PARTNER_ID in your .env file
 *
 * 3. Set Up Sender ID/Shortcode:
 *    - Register a Sender ID in your TextSMS dashboard
 *    - Sender IDs may require approval
 *    - Set TEXTSMS_SHORTCODE in your .env file
 *    - This is required for sending SMS
 *
 * 4. Fund Your Account:
 *    - Ensure your TextSMS account has sufficient credits
 *    - Check balance in the dashboard or via API
 *
 * ENVIRONMENT VARIABLES:
 * - TEXTSMS_API_KEY (required) - Your TextSMS API key
 * - TEXTSMS_PARTNER_ID (required) - Your TextSMS Partner ID
 * - TEXTSMS_SHORTCODE (required) - Your registered Sender ID/Shortcode
 */
@Injectable()
export class TextsmsProvider implements ISmsProvider {
  private readonly logger = new Logger(TextsmsProvider.name);
  private apiKey: string | null = null;
  private partnerId: string | null = null;
  private shortcode: string | null = null;
  private apiUrl = 'https://sms.textsms.co.ke/api/services/sendsms/';
  private otpApiUrl = 'https://sms.textsms.co.ke/api/services/sendotp/';

  /**
   * Get configuration values (lazy-loaded to ensure env vars are available)
   */
  private getConfig() {
    if (this.apiKey === null) {
      // Load configuration from EnvironmentConfig (centralized environment management)
      this.apiKey = (env.sms.textsmsApiKey || '').trim();
      this.partnerId = (env.sms.textsmsPartnerId || '').trim();
      this.shortcode = (env.sms.textsmsShortcode || '').trim();

      // Debug logging to help diagnose configuration issues
      if (env.isDevelopment()) {
        this.logger.debug('Configuration loaded:', {
          apiUrl: this.apiUrl,
          otpApiUrl: this.otpApiUrl,
          apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : 'NOT SET',
          partnerId: this.partnerId || 'NOT SET',
          shortcode: this.shortcode || 'NOT SET',
        });
      }
    }
    return {
      apiUrl: this.apiUrl,
      apiKey: this.apiKey!,
      partnerId: this.partnerId!,
      shortcode: this.shortcode!,
    };
  }

  getName(): string {
    return 'textsms';
  }

  isConfigured(): boolean {
    // API key, Partner ID, and Shortcode are all required
    const config = this.getConfig();
    return !!(config.apiKey && config.partnerId && config.shortcode);
  }

  /**
   * Get configuration status details for debugging
   */
  getConfigurationStatus(): { configured: boolean; missing: string[] } {
    const config = this.getConfig();
    const missing: string[] = [];
    if (!config.apiKey) missing.push('TEXTSMS_API_KEY');
    if (!config.partnerId) missing.push('TEXTSMS_PARTNER_ID');
    if (!config.shortcode) missing.push('TEXTSMS_SHORTCODE');
    return {
      configured: missing.length === 0,
      missing,
    };
  }

  /**
   * Convert phone number from 07XXXXXXXX to 2547XXXXXXXX format
   * TextSMS expects format: 2547XXXXXXXX (international format without +)
   */
  private formatPhoneForTextSMS(phoneNumber: string): string {
    let cleanPhone = phoneNumber.trim();

    // Remove leading + if present
    if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1);
    }

    // Convert 07XXXXXXXX to 2547XXXXXXXX
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('254')) {
      throw new Error(
        `Invalid phone number format for TextSMS: ${phoneNumber}. Expected format: 07XXXXXXXX or 2547XXXXXXXX`
      );
    }

    // Validate format: should be 12 digits (254 + 9 digits)
    if (!/^2547\d{8}$/.test(cleanPhone)) {
      throw new Error(
        `Invalid phone number format for TextSMS: ${phoneNumber}. Expected format: 07XXXXXXXX or 2547XXXXXXXX`
      );
    }

    return cleanPhone;
  }

  /**
   * Get user-friendly error message based on response code
   * Reference: https://textsms.co.ke/bulk-sms-api/
   */
  private getErrorMessage(responseCode: number, responseDescription?: string): string {
    // Map common response codes to user-friendly messages
    const errorMessages: Record<number, string> = {
      200: 'Success', // Not an error, but included for completeness
      1001: 'Invalid sender ID. Please verify your sender ID is registered and approved.',
      1002: 'Network not allowed. Please check your account permissions.',
      1003: 'Invalid mobile number. Please check the phone number format.',
      1004: 'Low bulk credits. Please top up your TextSMS account.',
      1005: 'Failed. System error. Please try again later.',
      1006: 'Invalid credentials. Please verify your API key and Partner ID.',
      1007: 'Failed. System error. Please try again later.',
      1008: 'No Delivery Report available for this message.',
      1009: 'Unsupported data type. Please check your request format.',
      1010: 'Unsupported request type. Please use POST method.',
      4090: 'Internal Error. Try again after 5 minutes.',
      4091: 'No Partner ID is Set. Please provide a valid Partner ID.',
      4092: 'No API KEY Provided. Please provide a valid API key.',
      4093: 'Details Not Found. Please verify your credentials.',
    };

    // Use mapped message if available
    if (errorMessages[responseCode]) {
      return errorMessages[responseCode];
    }

    // Use response description if available
    if (responseDescription && responseDescription !== 'Success') {
      return responseDescription;
    }

    // Fallback
    return `Failed to send SMS (response code: ${responseCode})`;
  }

  async sendSms(phoneNumber: string, message: string, isOtp?: boolean): Promise<SmsResult> {
    const config = this.getConfig();

    if (!this.isConfigured()) {
      const configStatus = this.getConfigurationStatus();
      const missingVars =
        configStatus.missing.length > 0 ? ` Missing: ${configStatus.missing.join(', ')}` : '';
      return {
        success: false,
        error: `TextSMS credentials not configured.${missingVars}`,
      };
    }

    try {
      // Format phone number for TextSMS API
      const formattedPhone = this.formatPhoneForTextSMS(phoneNumber);

      // Prepare request body
      const requestBody = {
        apikey: config.apiKey,
        partnerID: config.partnerId,
        message: message,
        shortcode: config.shortcode,
        mobile: formattedPhone,
      };

      // Use OTP endpoint for OTP messages, bulk SMS endpoint for regular messages
      const endpointUrl = isOtp ? this.otpApiUrl : config.apiUrl;

      // Send SMS via TextSMS API
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Check HTTP status
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `TextSMS API returned ${response.status}: ${errorText}`,
          metadata: {
            httpStatus: response.status,
            httpStatusText: response.statusText,
          },
        };
      }

      // Parse JSON response
      let result: any;
      try {
        result = await response.json();
      } catch (parseError) {
        const responseText = await response.text().catch(() => 'Unable to read response');
        return {
          success: false,
          error: `Failed to parse TextSMS API response: ${responseText}`,
          metadata: {
            rawResponse: responseText,
          },
        };
      }

      // Log full response for debugging
      this.logger.debug('Full API Response:', JSON.stringify(result, null, 2));

      // TextSMS response structure: { responses: [{ respose-code, response-description, mobile, messageid, networkid }] }
      if (result.responses && Array.isArray(result.responses) && result.responses.length > 0) {
        const responseData = result.responses[0];
        const responseCode = responseData['respose-code'] || responseData['response-code'];
        const responseDescription = responseData['response-description'] || '';
        const messageId = responseData.messageid;
        const networkId = responseData.networkid;

        // Check if response code indicates success (200)
        if (responseCode === 200) {
          return {
            success: true,
            messageId: messageId ? String(messageId) : undefined,
            metadata: {
              apiResponse: result,
              formattedPhone,
              responseCode: responseCode,
              responseDescription: responseDescription,
              networkId: networkId,
            },
          };
        } else {
          // Error response code - get user-friendly error message
          const errorMessage = this.getErrorMessage(responseCode, responseDescription);

          this.logger.error(`SMS send failed: ${errorMessage}`, {
            responseCode,
            responseDescription,
            responseData,
          });

          return {
            success: false,
            error: errorMessage,
            metadata: {
              apiResponse: result,
              formattedPhone,
              responseCode: responseCode,
              responseDescription: responseDescription,
              networkId: networkId,
            },
          };
        }
      }

      // Check for error status in response
      if (result.status === 'error' || result.status === 'failed') {
        return {
          success: false,
          error: result.error || result.message || 'Failed to send SMS via TextSMS',
          metadata: {
            apiResponse: result,
            formattedPhone,
          },
        };
      }

      // Unknown response format - log and return error
      this.logger.error('Unknown response format:', result);
      return {
        success: false,
        error: 'Unknown response format from TextSMS API',
        metadata: {
          apiResponse: result,
          formattedPhone,
          warning: 'Response format not recognized',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Error sending SMS: ${errorMessage}`, error);
      return {
        success: false,
        error: `TextSMS error: ${errorMessage}`,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
