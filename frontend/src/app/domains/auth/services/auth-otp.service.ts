import { inject, Injectable } from '@angular/core';
import { REQUEST_LOGIN_OTP, REQUEST_REGISTRATION_OTP, VERIFY_LOGIN_OTP, VERIFY_REGISTRATION_OTP } from '../operations.graphql';
import { formatPhoneNumber } from '../../../shared/utils/phone.utils';
import { ApolloService } from '../../../shared/services/apollo.service';

/**
 * Auth OTP Service
 *
 * Handles OTP operations for login and registration.
 * Pure API layer for OTP flows.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthOtpService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Request login OTP
   */
  async requestLoginOTP(
    phoneNumber: string,
  ): Promise<{ success: boolean; message: string; expiresAt?: number }> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: REQUEST_LOGIN_OTP,
        variables: { phoneNumber },
        context: { skipChannelToken: true },
      });

      const data = result.data?.requestLoginOTP;
      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to request OTP');
      }

      return {
        success: data.success,
        message: data.message,
        expiresAt: data.expiresAt ?? undefined,
      };
    } catch (error: any) {
      const errorMessage =
        error?.graphQLErrors?.[0]?.message || error?.message || 'Failed to request OTP';
      throw new Error(errorMessage);
    }
  }

  /**
   * Verify login OTP
   */
  async verifyLoginOTP(
    phoneNumber: string,
    otp: string,
  ): Promise<{ success: boolean; token?: string; message: string }> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: VERIFY_LOGIN_OTP,
        variables: { phoneNumber, otp: otp.trim() },
        context: { skipChannelToken: true },
      });

      const data = result.data?.verifyLoginOTP;
      if (!data) {
        throw new Error('No response from server. Please try again.');
      }

      if (!data.success || !data.token) {
        throw new Error(data.message || 'OTP verification failed');
      }

      return {
        success: data.success,
        token: data.token,
        message: data.message,
      };
    } catch (error: any) {
      const errorMessage =
        error?.graphQLErrors?.[0]?.message ||
        error?.networkError?.message ||
        error?.message ||
        'OTP verification failed';
      throw new Error(errorMessage);
    }
  }

  /**
   * Request registration OTP
   * NEW: Now stores registration data and returns sessionId
   */
  async requestRegistrationOTP(
    phoneNumber: string,
    registrationData: any,
  ): Promise<{ success: boolean; message: string; sessionId?: string; expiresAt?: number }> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: REQUEST_REGISTRATION_OTP,
        variables: { phoneNumber, registrationData },
        context: { skipChannelToken: true },
      });

      const data = result.data?.requestRegistrationOTP;
      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to request OTP');
      }

      return {
        success: data.success,
        message: data.message,
        sessionId: data.sessionId ?? undefined,
        expiresAt: data.expiresAt ?? undefined,
      };
    } catch (error: any) {
      console.error('Failed to request registration OTP:', error);
      const errorMessage =
        error?.message || error?.graphQLErrors?.[0]?.message || 'Failed to request OTP';
      throw new Error(errorMessage);
    }
  }

  /**
   * Verify registration OTP and create account
   * NEW: Uses sessionId to retrieve stored registration data
   * After successful creation, user must login separately (tokens can't be assigned during signup)
   */
  async verifyRegistrationOTP(
    phoneNumber: string,
    otp: string,
    sessionId: string,
  ): Promise<{ success: boolean; userId?: string; message: string }> {
    try {
      const client = this.apolloService.getClient();

      // Normalize phone number to ensure consistency with backend
      const normalizedPhone = formatPhoneNumber(phoneNumber);

      // Validate sessionId
      if (!sessionId || !sessionId.trim()) {
        throw new Error('Session expired. Please start registration again.');
      }

      const result = await client.mutate({
        mutation: VERIFY_REGISTRATION_OTP,
        variables: {
          phoneNumber: normalizedPhone,
          otp: otp.trim(),
          sessionId: sessionId.trim(),
        },
        context: { skipChannelToken: true },
      });

      const data = result.data?.verifyRegistrationOTP;
      if (!data) {
        throw new Error('Registration failed - no response from server. Please try again.');
      }

      // Check if backend returned an error (even if mutation succeeded)
      if (!data.success) {
        // Extract specific error messages
        const errorMsg = data.message || 'Registration failed';

        // Provide user-friendly messages for common errors
        if (
          errorMsg.toLowerCase().includes('already exists') ||
          errorMsg.toLowerCase().includes('duplicate')
        ) {
          throw new Error(
            'An account with this phone number already exists. Please login instead.',
          );
        }

        if (
          errorMsg.toLowerCase().includes('not found') ||
          errorMsg.toLowerCase().includes('expired')
        ) {
          throw new Error('Registration session expired. Please start registration again.');
        }

        if (errorMsg.toLowerCase().includes('otp') || errorMsg.toLowerCase().includes('invalid')) {
          throw new Error('Invalid or expired OTP code. Please request a new OTP.');
        }

        if (
          errorMsg.toLowerCase().includes('channel') ||
          errorMsg.toLowerCase().includes('company code')
        ) {
          throw new Error('Company code is already taken. Please choose a different company name.');
        }

        throw new Error(errorMsg);
      }

      // Success - entities created on backend
      // Note: User must login separately (tokens can't be assigned during signup)
      return {
        success: data.success,
        userId: data.userId ?? undefined,
        message:
          data.message ||
          'Registration successful. Your account is pending admin approval. Please login to continue.',
      };
    } catch (error: any) {
      console.error('Verify registration OTP error:', error);

      // Handle GraphQL errors
      if (error?.graphQLErrors && error.graphQLErrors.length > 0) {
        const graphQLError = error.graphQLErrors[0];
        const errorMessage = graphQLError.message || 'Registration failed';

        // Provide user-friendly messages for common GraphQL errors
        if (
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate')
        ) {
          throw new Error(
            'An account with this phone number already exists. Please login instead.',
          );
        }

        if (
          errorMessage.toLowerCase().includes('not found') ||
          errorMessage.toLowerCase().includes('expired')
        ) {
          throw new Error('Registration session expired. Please start registration again.');
        }

        if (
          errorMessage.toLowerCase().includes('otp') ||
          errorMessage.toLowerCase().includes('invalid')
        ) {
          throw new Error('Invalid or expired OTP code. Please request a new OTP.');
        }

        throw new Error(errorMessage);
      }

      // Handle network errors
      if (error?.networkError) {
        const networkError = error.networkError;
        if (networkError.statusCode === 0 || networkError.message?.includes('Failed to fetch')) {
          throw new Error(
            'Unable to connect to server. Please check your internet connection and try again.',
          );
        }
        throw new Error('Network error occurred. Please try again.');
      }

      // Handle other errors
      const errorMessage = error?.message || 'Registration failed. Please try again.';
      throw new Error(errorMessage);
    }
  }
}
