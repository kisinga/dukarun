import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CHECK_COMPANY_CODE_AVAILABILITY } from '../graphql/operations.graphql';
import type { LoginMutation, LoginMutationVariables } from '../models/user.model';
import { ApolloService } from './apollo.service';
import { AuthLoginService } from './auth/auth-login.service';
import { AuthOtpService } from './auth/auth-otp.service';
import { AuthPermissionsService } from './auth/auth-permissions.service';
import { AuthSessionService } from './auth/auth-session.service';

/**
 * Global authentication service for admin users
 * Manages administrator authentication state, login/logout operations, and session management
 *
 * Note: Uses admin-api endpoint for authentication
 *
 * ARCHITECTURE:
 * - Composed of specialized sub-services for better maintainability
 * - Maintains backward compatibility with existing public API
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apolloService = inject(ApolloService);
  private readonly router = inject(Router);

  // Inject all sub-services
  private readonly sessionService = inject(AuthSessionService);
  private readonly otpService = inject(AuthOtpService);
  private readonly loginService = inject(AuthLoginService);
  private readonly permissionsService = inject(AuthPermissionsService);

  // Loading state signal
  private readonly isLoadingSignal = signal<boolean>(false);

  // Public computed signals - delegate to sub-services
  readonly user = this.sessionService.user;
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionService.user() !== null);
  readonly fullName = computed(() => {
    const user = this.sessionService.user();
    if (!user) return 'Loading...';
    return `${user.firstName} ${user.lastName}`.trim() || user.emailAddress;
  });

  // Permission signals - delegate to permissions service
  readonly hasUpdateSettingsPermission = this.permissionsService.hasUpdateSettingsPermission;
  readonly hasOverridePricePermission = this.permissionsService.hasOverridePricePermission;
  readonly hasCreditManagementPermission = this.permissionsService.hasCreditManagementPermission;
  readonly hasManageStockAdjustmentsPermission =
    this.permissionsService.hasManageStockAdjustmentsPermission;
  readonly hasCreateInterAccountTransferPermission =
    this.permissionsService.hasCreateInterAccountTransferPermission;
  readonly hasUpdateProductPermission = this.permissionsService.hasUpdateProductPermission;

  constructor() {
    // Register session expiration handler with Apollo service
    this.apolloService.onSessionExpired(() => {
      this.sessionService.handleSessionExpired();
    });

    // Initialize authentication
    this.sessionService.initializeAuth();
  }

  /**
   * Wait for initial authentication check to complete
   * Uses ReplaySubject to handle multiple subscribers gracefully
   */
  async waitForInitialization(): Promise<void> {
    return this.sessionService.waitForInitialization();
  }

  /**
   * Refetch the active administrator data from the server
   * Use this after making changes to the user profile
   */
  async refetchUser(): Promise<void> {
    return this.sessionService.fetchActiveAdministrator();
  }

  /**
   * Login with phone number and OTP (passwordless)
   * This is the new primary login method
   */
  async loginWithOTP(phoneNumber: string, otp: string): Promise<void> {
    this.isLoadingSignal.set(true);
    try {
      await this.loginService.loginWithOTP(phoneNumber, otp);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Request login OTP
   */
  async requestLoginOTP(
    phoneNumber: string,
  ): Promise<{ success: boolean; message: string; expiresAt?: number }> {
    return this.otpService.requestLoginOTP(phoneNumber);
  }

  /**
   * Request registration OTP
   * NEW: Now stores registration data and returns sessionId
   */
  async requestRegistrationOTP(
    phoneNumber: string,
    registrationData: any,
  ): Promise<{ success: boolean; message: string; sessionId?: string; expiresAt?: number }> {
    return this.otpService.requestRegistrationOTP(phoneNumber, registrationData);
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
    return this.otpService.verifyRegistrationOTP(phoneNumber, otp, sessionId);
  }

  /**
   * Check if a company code (sanitized company name) is available
   * Used for frontend validation before submission
   */
  async checkCompanyCodeAvailability(companyCode: string): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: CHECK_COMPANY_CODE_AVAILABILITY,
        variables: { companyCode },
        context: { skipChannelToken: true },
        fetchPolicy: 'network-only', // Always check fresh
      });
      return result.data?.checkCompanyCodeAvailability ?? false;
    } catch (error) {
      console.error('Error checking company code availability:', error);
      // On error, assume unavailable to be safe
      return false;
    }
  }

  /**
   * Check authorization status
   */
  async checkAuthorizationStatus(
    identifier: string,
  ): Promise<{ status: 'PENDING' | 'APPROVED' | 'REJECTED'; message: string }> {
    try {
      // TODO: Replace with actual GraphQL query when backend is ready
      // const client = this.apolloService.getClient();
      // const result = await client.query({
      //   query: CHECK_AUTHORIZATION_STATUS,
      //   variables: { identifier },
      //   context: { skipChannelToken: true },
      // });
      // return result.data?.checkAuthorizationStatus;

      // Mock response - assume approved for now (backend will handle actual check)
      return {
        status: 'APPROVED' as const,
        message: 'Account is approved',
      };
    } catch (error) {
      console.error('Check authorization status error:', error);
      // Default to pending if check fails
      return {
        status: 'PENDING' as const,
        message: 'Unable to verify authorization status',
      };
    }
  }

  /**
   * Legacy login with username and password (kept for backward compatibility)
   * @deprecated Use loginWithOTP instead
   */
  async login(credentials: LoginMutationVariables): Promise<LoginMutation['login']> {
    this.isLoadingSignal.set(true);
    try {
      return await this.loginService.login(credentials);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    this.isLoadingSignal.set(true);

    try {
      await this.loginService.logout();
    } finally {
      this.sessionService.clearSession();
      this.router.navigate(['/login']);
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Check if user has a specific role (extend as needed)
   */
  hasRole(role: string): boolean {
    return this.permissionsService.hasRole(role);
  }
}
