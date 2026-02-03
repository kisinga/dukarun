import { Injectable, inject, Optional, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { propagation, context as otelContext } from '@opentelemetry/api';
import { environment } from '../../../environments/environment';
import { APOLLO_TEST_CLIENT } from './apollo-test-client.token';

/**
 * Service for managing Apollo GraphQL client
 * Handles authentication tokens, headers, and request configuration
 */
@Injectable({
  providedIn: 'root',
})
export class ApolloService {
  private readonly router = inject(Router);

  private readonly AUTH_TOKEN_KEY = 'auth_token';
  private readonly CHANNEL_TOKEN_KEY = 'channel_token';
  private readonly LANGUAGE_CODE_KEY = 'language_code';

  private apolloClient: ApolloClient;
  private sessionExpiredCallback?: () => void;

  constructor(@Optional() @Inject(APOLLO_TEST_CLIENT) testClient?: ApolloClient) {
    this.apolloClient = testClient ?? this.createApolloClient();
  }

  /**
   * Register callback to be called when session expires
   * Used by AuthService to handle cleanup
   */
  onSessionExpired(callback: () => void): void {
    this.sessionExpiredCallback = callback;
  }

  /**
   * Get the Apollo client instance
   */
  getClient(): ApolloClient {
    return this.apolloClient;
  }

  /**
   * Store authentication token
   */
  setAuthToken(token: string): void {
    localStorage.setItem(this.AUTH_TOKEN_KEY, token);
  }

  /**
   * Get stored authentication token
   */
  getAuthToken(): string | null {
    return localStorage.getItem(this.AUTH_TOKEN_KEY);
  }

  /**
   * Remove authentication token
   */
  clearAuthToken(): void {
    localStorage.removeItem(this.AUTH_TOKEN_KEY);
  }

  /**
   * Set channel token for multi-channel projects
   */
  setChannelToken(token: string): void {
    localStorage.setItem(this.CHANNEL_TOKEN_KEY, token);
  }

  /**
   * Get channel token
   */
  getChannelToken(): string | null {
    return localStorage.getItem(this.CHANNEL_TOKEN_KEY);
  }

  /**
   * Clear channel token
   */
  clearChannelToken(): void {
    localStorage.removeItem(this.CHANNEL_TOKEN_KEY);
  }

  /**
   * Set language code for localized results
   */
  setLanguageCode(code: string): void {
    localStorage.setItem(this.LANGUAGE_CODE_KEY, code);
  }

  /**
   * Get language code
   */
  getLanguageCode(): string | null {
    return localStorage.getItem(this.LANGUAGE_CODE_KEY);
  }

  /**
   * Create and configure Apollo client
   */
  private createApolloClient(): ApolloClient {
    const httpLink = new HttpLink({
      uri: () => {
        const languageCode = this.getLanguageCode();
        if (languageCode) {
          return `${environment.apiUrl}?languageCode=${languageCode}`;
        }
        return environment.apiUrl;
      },
      // Required for cookie-based session management
      credentials: 'include',
      // Include cookies in CORS requests
      fetchOptions: {
        mode: 'cors',
      },
    });

    /**
     * Middleware to attach auth token and headers to requests
     *
     * Channel Token Behavior:
     * - By default, channel token is included in all requests (if available)
     * - To skip channel token for specific operations, pass context option:
     *
     *   Example:
     *   ```
     *   client.query({
     *     query: MY_QUERY,
     *     context: { skipChannelToken: true }
     *   })
     *   ```
     *
     * This is useful for auth operations where channel context isn't established yet
     */
    const authLink = new SetContextLink(async (prevContext, operation) => {
      const authToken = this.getAuthToken();
      const channelToken = this.getChannelToken();
      const headers: Record<string, string> = { ...prevContext['headers'] };

      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      // Only send channel token if:
      // 1. Channel token exists
      // 2. Operation context doesn't explicitly skip it
      if (channelToken && !prevContext['skipChannelToken']) {
        headers['vendure-token'] = channelToken;
      }

      // Propagate trace context to backend for distributed tracing
      propagation.inject(otelContext.active(), headers);

      return { headers };
    });

    // Global error handling for authentication errors
    const errorLink = onError((errorResponse) => {
      // Access error properties with type assertion since TypeScript types may not expose them
      const graphQLErrors = (errorResponse as any).graphQLErrors;
      const networkError = (errorResponse as any).networkError;

      // Check GraphQL errors first
      if (graphQLErrors && graphQLErrors.length > 0) {
        for (const gqlError of graphQLErrors) {
          const errorCode = gqlError.extensions?.code;
          const errorMessage = gqlError.message || '';

          // Handle CHANNEL_NOT_FOUND - clear stale channel token
          if (
            errorCode === 'CHANNEL_NOT_FOUND' ||
            errorMessage.includes('CHANNEL_NOT_FOUND') ||
            errorMessage.includes('channel-not-found')
          ) {
            console.warn('Channel not found - clearing stale channel token');
            this.clearChannelToken();
            // Don't redirect - just clear the token and let polling stop
            return;
          }

          // Handle auth errors
          if (errorCode === 'FORBIDDEN' || errorCode === 'UNAUTHORIZED') {
            console.warn('Session expired or unauthorized access detected');
            this.handleSessionExpired();
            return;
          }
        }
      }

      // Check network errors
      if (networkError) {
        const errorMessage = (networkError as any)?.message || '';
        if (
          errorMessage.includes('not authorized') ||
          errorMessage.includes('not authenticated') ||
          errorMessage.includes('Unauthorized')
        ) {
          console.warn('Session expired based on network error message');
          this.handleSessionExpired();
          return;
        }
      }
    });

    return new ApolloClient({
      link: from([errorLink, authLink, httpLink]),
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'cache-and-network',
          errorPolicy: 'all',
        },
        query: {
          fetchPolicy: 'network-only',
          errorPolicy: 'all',
        },
        mutate: {
          errorPolicy: 'all',
        },
      },
    });
  }

  /**
   * Handle session expiration
   * Clears local state and redirects to login
   */
  private handleSessionExpired(): void {
    // Clear local storage
    this.clearAuthToken();
    this.clearChannelToken();

    // Notify AuthService to clean up its state
    if (this.sessionExpiredCallback) {
      this.sessionExpiredCallback();
    }

    // Clear Apollo cache
    this.apolloClient.clearStore().catch(console.error);

    // Redirect to login page
    this.router.navigate(['/login'], {
      queryParams: { sessionExpired: 'true' },
    });
  }

  /**
   * Clear Apollo cache
   */
  async clearCache(): Promise<void> {
    await this.apolloClient.clearStore();
  }

  /**
   * Reset Apollo store (clears cache and refetches active queries)
   */
  async resetStore(): Promise<void> {
    await this.apolloClient.resetStore();
  }

  /**
   * Execute a GraphQL query
   */
  async query<T = any>(query: any, variables?: any, context?: any): Promise<{ data: T }> {
    const result = await this.apolloClient.query<T>({
      query,
      variables,
      context,
    });
    return { data: result.data as T };
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate<T = any>(mutation: any, variables?: any, context?: any): Promise<{ data: T }> {
    const result = await this.apolloClient.mutate<T>({
      mutation,
      variables,
      context,
    });
    return { data: result.data as T };
  }
}
