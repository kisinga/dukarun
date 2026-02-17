import { inject, Injectable } from '@angular/core';
import { LOGIN, LOGOUT } from '../../graphql/operations.graphql';
import type {
  LoginMutation,
  LoginMutationVariables,
  LogoutMutation,
} from '../../models/user.model';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { ApolloService } from '../apollo.service';
import { AppInitService } from '../app-init.service';
import { AppCacheService } from '../cache/app-cache.service';
import { CompanyService } from '../company.service';
import { AuthOtpService } from './auth-otp.service';
import { AuthSessionService } from './auth-session.service';

/**
 * Auth Login Service
 *
 * Handles login operations.
 * Coordinates OTP verification and login.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthLoginService {
  private readonly apolloService = inject(ApolloService);
  private readonly otpService = inject(AuthOtpService);
  private readonly sessionService = inject(AuthSessionService);
  private readonly companyService = inject(CompanyService);
  private readonly appCache = inject(AppCacheService);
  private readonly appInitService = inject(AppInitService);

  /**
   * Clear all caches to ensure fresh state on login
   * Called after successful authentication but before fetching user data
   */
  private async clearAllCaches(): Promise<void> {
    try {
      // Clear Apollo cache (GraphQL query results)
      await this.apolloService.clearCache();

      // Clear single app cache (channel DB + global/session KV)
      await this.appCache.clearAll();

      // Clear company session data
      this.companyService.clearActiveCompany();

      // Clear app initialization cache (products, ML models, locations, etc.)
      this.appInitService.clearCache();

      console.log('🧹 All caches cleared on login');
    } catch (error) {
      // Don't fail login if cache clearing fails
      console.error('Failed to clear some caches (non-critical):', error);
    }
  }

  /**
   * Login with phone number and OTP (passwordless)
   * This is the new primary login method
   */
  async loginWithOTP(phoneNumber: string, otp: string): Promise<void> {
    try {
      const client = this.apolloService.getClient();

      // Verify OTP and get session token
      const verifyResult = await this.otpService.verifyLoginOTP(phoneNumber, otp);

      // Use token to complete login
      // Ensure phone number is normalized for login (must match format used during OTP verification)
      const normalizedPhone = formatPhoneNumber(phoneNumber);
      console.log('[AUTH SERVICE] Attempting login with:', {
        username: normalizedPhone,
        originalPhone: phoneNumber,
        tokenPrefix: verifyResult.token?.substring(0, 20),
        tokenLength: verifyResult.token?.length,
      });

      const loginResult = await client.mutate<LoginMutation, LoginMutationVariables>({
        mutation: LOGIN,
        variables: {
          username: normalizedPhone,
          password: verifyResult.token!,
          rememberMe: true, // Long-lived cookies for mobile OTP logins
        },
        context: { skipChannelToken: true },
      });

      const loginData = loginResult.data?.login;
      if (!loginData || 'errorCode' in loginData) {
        throw new Error(loginData?.message || 'Login failed');
      }

      // Clear all caches to ensure fresh state for the new session
      await this.clearAllCaches();

      await this.sessionService.fetchActiveAdministrator();
    } catch (error: any) {
      console.error('Login error:', error);
      console.error('Error details:', {
        message: error?.message,
        graphQLErrors: error?.graphQLErrors,
        networkError: error?.networkError,
      });

      // Extract error message from various sources
      const errorMessage =
        error?.graphQLErrors?.[0]?.message ||
        error?.networkError?.message ||
        error?.message ||
        'Login failed. Please try again.';

      throw new Error(errorMessage);
    }
  }

  /**
   * Legacy login with username and password (kept for backward compatibility)
   * @deprecated Use loginWithOTP instead
   */
  async login(credentials: LoginMutationVariables): Promise<LoginMutation['login']> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<LoginMutation, LoginMutationVariables>({
        mutation: LOGIN,
        variables: credentials,
        context: { skipChannelToken: true },
      });
      const { data } = result;

      const loginResult = data?.login;

      // Successful login
      if (loginResult?.__typename === 'CurrentUser') {
        // Clear all caches to ensure fresh state for the new session
        await this.clearAllCaches();

        // Set companies/channels from login response
        if (loginResult.channels && loginResult.channels.length > 0) {
          this.companyService.setCompaniesFromChannels(loginResult.channels);
        }

        // Fetch full administrator details
        await this.sessionService.fetchActiveAdministrator();
      }

      return loginResult!;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      const client = this.apolloService.getClient();
      await client.mutate<LogoutMutation>({
        mutation: LOGOUT,
        context: { skipChannelToken: true },
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}
