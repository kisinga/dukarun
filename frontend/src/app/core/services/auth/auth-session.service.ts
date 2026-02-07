import { inject, Injectable, signal } from '@angular/core';
import { ReplaySubject, firstValueFrom } from 'rxjs';
import { GET_ACTIVE_ADMIN } from '../../graphql/operations.graphql';
import type { ActiveAdministrator, GetActiveAdministratorQuery } from '../../models/user.model';
import { ApolloService } from '../apollo.service';
import { CompanyService } from '../company.service';

/**
 * Auth Session Service
 *
 * Handles session state and initialization.
 * Manages user signal and initialization state.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthSessionService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  // Authentication state signals
  private readonly userSignal = signal<ActiveAdministrator | null>(null);
  private readonly initialized$ = new ReplaySubject<boolean>(1);

  readonly user = this.userSignal.asReadonly();

  /**
   * Wait for initial authentication check to complete
   * Uses ReplaySubject to handle multiple subscribers gracefully
   */
  async waitForInitialization(): Promise<void> {
    await firstValueFrom(this.initialized$);
  }

  /**
   * Initialize authentication by checking for existing session
   * Admin-api uses cookie-based sessions, not JWT tokens
   */
  async initializeAuth(): Promise<void> {
    try {
      await this.fetchActiveAdministrator();
    } finally {
      this.initialized$.next(true);
      this.initialized$.complete();
    }
  }

  /**
   * Fetch the currently authenticated administrator
   * Also fetches user channels on initialization to restore state
   */
  async fetchActiveAdministrator(): Promise<void> {
    try {
      const client = this.apolloService.getClient();

      // Add timeout to prevent hanging indefinitely
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 5000); // 5 second timeout (reduced for faster failure)
      });

      const queryPromise = client.query<GetActiveAdministratorQuery>({
        query: GET_ACTIVE_ADMIN,
        fetchPolicy: 'network-only',
        context: { skipChannelToken: true },
        errorPolicy: 'all', // Return partial results even on error
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const { data } = result;

      if (data?.activeAdministrator) {
        // Use the generated type directly - it's the source of truth
        this.userSignal.set(data.activeAdministrator);
        console.log('✅ Active admin fetched, now restoring session...');

        // CRITICAL: Restore session BEFORE fetching channels
        // This prevents fetchUserChannels from resetting to first company
        this.companyService.initializeFromStorage();

        // Fetch user channels asynchronously (non-blocking) to restore channel state
        // This ensures channels are available even on hard refresh, but doesn't block initialization
        this.companyService.fetchUserChannels().catch((error) => {
          console.warn('Failed to fetch user channels (non-critical):', error);
          // Don't fail initialization if channel fetch fails
        });
      } else {
        // No administrator data means not authenticated
        this.userSignal.set(null);
      }
    } catch (error: any) {
      console.error('Failed to fetch active administrator:', error);

      // Always set user to null on error to prevent hanging
      // This ensures the auth guard can make a decision
      this.userSignal.set(null);

      // Don't throw - initialization must complete so guards can proceed
      // This allows the app to load even if backend is unavailable
    }
  }

  /**
   * Clear local session data
   */
  clearSession(): void {
    this.userSignal.set(null);
    this.companyService.clearActiveCompany();
    this.apolloService.clearAuthToken();
    this.apolloService.clearCache();
  }

  /**
   * Handle session expiration
   * Called by Apollo service when authentication error is detected
   */
  handleSessionExpired(): void {
    console.warn('Session expired - clearing user state');
    this.userSignal.set(null);
    this.companyService.clearActiveCompany();
    // Note: Apollo service handles redirect and cache clearing
  }

  /**
   * Set user (used after successful login)
   */
  setUser(user: ActiveAdministrator | null): void {
    this.userSignal.set(user);
  }
}
