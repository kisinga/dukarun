import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, SmsResult } from '../interfaces/sms-provider.interface';
import { env } from '../../config/environment.config';

/**
 * AfricasTalking SMS Provider
 *
 * Implements SMS sending via AfricasTalking SMS API using Basic Authentication
 * API Documentation: http://developers.africastalking.com/docs/sms/overview
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Create Account:
 *    - Sign up at https://account.africastalking.com
 *    - Activate your account
 *
 * 2. Get API Credentials:
 *    - Navigate to Settings > API Key
 *    - Generate a new API Key if needed
 *    - Note down your Username and API Key
 *    - Set AFRICASTALKING_USERNAME in your .env file
 *    - Set AFRICASTALKING_API_KEY in your .env file
 *
 * 3. Set Up Sender ID (Optional but Recommended):
 *    - Go to SMS > Sender IDs in your dashboard
 *    - Use the default Sender ID or request a custom one
 *    - Custom Sender IDs may require approval (24-48 hours)
 *    - Set AFRICASTALKING_SENDER_ID in your .env file
 *    - Note: If not provided, AfricasTalking will use a default Sender ID
 *
 * 4. Fund Your Account:
 *    - Ensure your AfricasTalking account has sufficient credits
 *    - Check balance in the SMS dashboard
 *
 * 5. Test in Sandbox (Optional):
 *    - Use AFRICASTALKING_ENVIRONMENT=sandbox for testing
 *    - Sandbox uses username "sandbox" and sandbox API key
 *
 * ENVIRONMENT VARIABLES:
 * - AFRICASTALKING_USERNAME (required) - Your AfricasTalking username
 * - AFRICASTALKING_API_KEY (required) - Your AfricasTalking API key
 * - AFRICASTALKING_SENDER_ID (optional - leave empty to use default)
 * - AFRICASTALKING_ENVIRONMENT (optional - 'sandbox' or 'production', defaults to 'production')
 * - AFRICASTALKING_API_URL (optional - defaults to standard endpoint based on environment)
 */
@Injectable()
export class AfricasTalkingProvider implements ISmsProvider {
  private readonly logger = new Logger(AfricasTalkingProvider.name);
  private apiUrl: string | null = null;
  private username: string | null = null;
  private apiKey: string | null = null;
  private senderId: string | null = null;
  private environment: string | null = null;

  /**
   * Get configuration values (lazy-loaded to ensure env vars are available)
   */
  private getConfig() {
    if (this.apiUrl === null) {
      // Load configuration from EnvironmentConfig (centralized environment management)
      this.environment = (env.sms.africastalkingEnvironment || 'production').toLowerCase();
      this.username = (env.sms.africastalkingUsername || '').trim();
      this.apiKey = (env.sms.africastalkingApiKey || '').trim();
      this.senderId = (env.sms.africastalkingSenderId || '').trim();

      // Set API URL based on environment
      if (this.environment === 'sandbox') {
        this.apiUrl =
          env.sms.africastalkingApiUrl ||
          'https://api.sandbox.africastalking.com/version1/messaging';
      } else {
        this.apiUrl =
          env.sms.africastalkingApiUrl || 'https://api.africastalking.com/version1/messaging';
      }

      // Debug logging to help diagnose configuration issues
      if (env.isDevelopment()) {
        this.logger.debug('Configuration loaded:', {
          environment: this.environment,
          apiUrl: this.apiUrl,
          username: this.username || 'NOT SET',
          apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : 'NOT SET',
          senderId: this.senderId || 'NOT SET (using default)',
        });
      }
    }
    return {
      apiUrl: this.apiUrl!,
      username: this.username!,
      apiKey: this.apiKey!,
      senderId: this.senderId!,
      environment: this.environment!,
    };
  }

  getName(): string {
    return 'africastalking';
  }

  isConfigured(): boolean {
    // Username and API key are required
    const config = this.getConfig();
    return !!(config.username && config.apiKey);
  }

  /**
   * Get configuration status details for debugging
   */
  getConfigurationStatus(): { configured: boolean; missing: string[] } {
    const config = this.getConfig();
    const missing: string[] = [];
    if (!config.username) missing.push('AFRICASTALKING_USERNAME');
    if (!config.apiKey) missing.push('AFRICASTALKING_API_KEY');
    return {
      configured: missing.length === 0,
      missing,
    };
  }

  /**
   * Check if status code indicates success
   * Reference: https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail
   */
  private isSuccessStatusCode(statusCode: number, status: string): boolean {
    // Status codes 100 and 101 both indicate success
    // Also check status text as fallback
    if (statusCode === 100 || statusCode === 101) {
      return true;
    }

    // Check status text for success indicators
    const statusLower = status.toLowerCase();
    return statusLower === 'success' || statusLower === 'sent' || statusLower === 'queued';
  }

  /**
   * Check if error is retryable
   * Some errors are transient and may succeed on retry
   */
  private isRetryableError(statusCode: number): boolean {
    // Retryable errors: temporary failures, gateway issues
    const retryableCodes = [
      102, // Internal Failure (may be temporary)
      500, // Server error
      502, // Bad gateway
      503, // Service unavailable
      504, // Gateway timeout
    ];
    return retryableCodes.includes(statusCode);
  }

  /**
   * Get user-friendly error message based on status code
   * Reference: https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail
   */
  private getErrorMessage(
    statusCode: number,
    status: string,
    recipient: any,
    defaultMessage: string
  ): string {
    // Map common status codes to user-friendly messages
    const errorMessages: Record<number, string> = {
      102: 'Insufficient balance. Please top up your AfricasTalking account.',
      103: 'Invalid phone number format. Please check the phone number.',
      104: 'Invalid sender ID. Please verify your sender ID is registered and approved.',
      105: 'Message rejected by gateway. Please check message content compliance.',
      401: 'Invalid phone number. The provided phone number is incorrect.',
      402: 'Invalid sender ID. The sender ID is not recognized or authorized.',
      403: 'Message rejected by gateway. Content may violate gateway policies.',
      404: 'Not found. The requested resource does not exist.',
      406: 'User in blacklist. The recipient has opted out or is blacklisted.',
      500: 'Internal server error. Please try again later.',
      502: 'Bad gateway. Please try again later.',
      503: 'Service unavailable. Please try again later.',
      504: 'Gateway timeout. Please try again later.',
    };

    // Use mapped message if available
    if (errorMessages[statusCode]) {
      return errorMessages[statusCode];
    }

    // Use recipient message if available
    if (recipient.message && recipient.message !== 'None') {
      return recipient.message;
    }

    // Use status text if available
    if (status && status !== 'None') {
      return status;
    }

    // Use default message
    if (defaultMessage) {
      return defaultMessage;
    }

    // Fallback
    return `Failed to send SMS (statusCode: ${statusCode})`;
  }

  /**
   * Convert phone number from 07XXXXXXXX to +2547XXXXXXXX format
   * AfricasTalking expects format: +254xxxxxxxxx (with +)
   */
  private formatPhoneForAfricasTalking(phoneNumber: string): string {
    let cleanPhone = phoneNumber.trim();

    // Remove leading + if present (we'll add it back)
    if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1);
    }

    // Convert 07XXXXXXXX to 2547XXXXXXXX
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('254')) {
      throw new Error(
        `Invalid phone number format for AfricasTalking SMS: ${phoneNumber}. Expected format: 07XXXXXXXX or 2547XXXXXXXX`
      );
    }

    // Add + prefix
    return '+' + cleanPhone;
  }

  async sendSms(phoneNumber: string, message: string, isOtp?: boolean): Promise<SmsResult> {
    const config = this.getConfig();

    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          'AfricasTalking SMS credentials not configured. Please set AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY in your environment variables.',
      };
    }

    try {
      // Format phone number for AfricasTalking API
      const formattedPhone = this.formatPhoneForAfricasTalking(phoneNumber);

      // Prepare request body
      // AfricasTalking accepts both URL-encoded form data and JSON
      // Using URL-encoded form data as it's more standard for their API
      const formData = new URLSearchParams();
      formData.append('username', config.username);
      formData.append('to', formattedPhone);
      formData.append('message', message);

      // Sender ID is optional - only include if provided
      if (config.senderId) {
        formData.append('from', config.senderId);
      }

      // Send SMS via AfricasTalking API
      // AfricasTalking requires:
      // 1. apikey in HTTP header
      // 2. username in request body (form data)
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          apikey: config.apiKey,
        },
        body: formData.toString(),
      });

      // Check HTTP status
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `AfricasTalking API returned ${response.status}: ${errorText}`,
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
          error: `Failed to parse AfricasTalking API response: ${responseText}`,
          metadata: {
            rawResponse: responseText,
          },
        };
      }

      // Log full response for debugging
      this.logger.debug('Full API Response:', JSON.stringify(result, null, 2));

      // AfricasTalking response structure: { SMSMessageData: { Message: "...", Recipients: [...] } }
      // Reference: https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail
      if (result.SMSMessageData) {
        const messageData = result.SMSMessageData;
        const recipients = messageData.Recipients || [];
        const message = messageData.Message || '';

        if (recipients.length > 0) {
          const recipient = recipients[0];
          const statusCode = recipient.statusCode;
          const status = recipient.status || '';

          // Determine if status code indicates success
          // Success codes: 100, 101 (both indicate successful submission)
          const isSuccess = this.isSuccessStatusCode(statusCode, status);

          if (isSuccess) {
            return {
              success: true,
              messageId:
                recipient.messageId && recipient.messageId !== 'None'
                  ? recipient.messageId
                  : undefined,
              metadata: {
                apiResponse: result,
                formattedPhone,
                message: message,
                statusCode: statusCode,
                status: status,
                cost: recipient.cost,
              },
            };
          } else {
            // Error status code - get user-friendly error message
            const errorMessage = this.getErrorMessage(statusCode, status, recipient, message);

            // Log error with appropriate level based on error type
            if (this.isRetryableError(statusCode)) {
              this.logger.warn(`SMS send failed (retryable): ${errorMessage}`, {
                statusCode,
                status,
                recipient: recipient,
              });
            } else {
              this.logger.error(`SMS send failed: ${errorMessage}`, {
                statusCode,
                status,
                recipient: recipient,
              });
            }

            return {
              success: false,
              error: errorMessage,
              metadata: {
                apiResponse: result,
                formattedPhone,
                statusCode: statusCode,
                status: status,
                retryable: this.isRetryableError(statusCode),
              },
            };
          }
        } else {
          // No recipients in response - check message
          if (
            message.toLowerCase().includes('sent') ||
            message.toLowerCase().includes('queued') ||
            message.toLowerCase().includes('success')
          ) {
            this.logger.warn('Success message but no recipients array:', result);
            return {
              success: true,
              metadata: {
                apiResponse: result,
                formattedPhone,
                message: message,
                warning: 'No recipients array in response',
              },
            };
          } else {
            return {
              success: false,
              error: message || 'Failed to send SMS via AfricasTalking (no recipients in response)',
              metadata: {
                apiResponse: result,
                formattedPhone,
              },
            };
          }
        }
      }

      // Check for error status in response
      if (result.status === 'error' || result.status === 'failed') {
        return {
          success: false,
          error: result.error || result.message || 'Failed to send SMS via AfricasTalking',
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
        error: 'Unknown response format from AfricasTalking API',
        metadata: {
          apiResponse: result,
          formattedPhone,
          warning: 'Response format not recognized',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: `AfricasTalking SMS error: ${errorMessage}`,
        metadata: {
          originalError: error,
        },
      };
    }
  }
}
