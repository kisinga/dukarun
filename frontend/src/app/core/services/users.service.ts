import { inject, Injectable, signal } from '@angular/core';
import type {
  GetAdministratorByIdQuery,
  GetAdministratorByIdQueryVariables,
  GetAdministratorByUserIdQuery,
  GetAdministratorByUserIdQueryVariables,
} from '../graphql/generated/graphql';
import {
  GET_ADMINISTRATOR_BY_ID,
  GET_ADMINISTRATOR_BY_USER_ID,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';

/**
 * User/Administrator data
 */
export interface UserDetails {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    identifier: string;
    verified: boolean;
    lastLogin?: string | null;
    roles: Array<{
      id: string;
      code: string;
      description?: string | null;
      permissions: string[];
      channels: Array<{
        id: string;
        code: string;
        token: string;
      }>;
    }>;
  } | null;
}

/**
 * Service for user/administrator management operations
 */
@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly apolloService = inject(ApolloService);

  // State signals
  private readonly currentUserSignal = signal<UserDetails | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Fetch administrator by ID
   * @param id - Administrator ID
   */
  async fetchAdministratorById(id: string): Promise<UserDetails | null> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<
        GetAdministratorByIdQuery,
        GetAdministratorByIdQueryVariables
      >({
        query: GET_ADMINISTRATOR_BY_ID,
        variables: { id },
        fetchPolicy: 'network-only',
      });

      const administrator = result.data?.administrator;
      if (administrator) {
        const userDetails: UserDetails = {
          id: administrator.id,
          firstName: administrator.firstName,
          lastName: administrator.lastName,
          emailAddress: administrator.emailAddress,
          createdAt: administrator.createdAt,
          updatedAt: administrator.updatedAt,
          user: administrator.user
            ? {
                id: administrator.user.id,
                identifier: administrator.user.identifier,
                verified: administrator.user.verified,
                lastLogin: administrator.user.lastLogin || null,
                roles: administrator.user.roles.map((role) => ({
                  id: role.id,
                  code: role.code,
                  description: role.description || null,
                  permissions: role.permissions,
                  channels: role.channels.map((ch) => ({
                    id: ch.id,
                    code: ch.code,
                    token: ch.token,
                  })),
                })),
              }
            : null,
        };
        this.currentUserSignal.set(userDetails);
        return userDetails;
      }

      this.errorSignal.set('Administrator not found');
      return null;
    } catch (error: any) {
      console.error('❌ Failed to fetch administrator:', error);
      this.errorSignal.set(error.message || 'Failed to fetch administrator');
      this.currentUserSignal.set(null);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Fetch administrator by User ID (e.g. from audit trail where userId is Vendure User ID).
   * @param userId - Vendure User ID (not Administrator ID)
   */
  async fetchAdministratorByUserId(userId: string): Promise<UserDetails | null> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<
        GetAdministratorByUserIdQuery,
        GetAdministratorByUserIdQueryVariables
      >({
        query: GET_ADMINISTRATOR_BY_USER_ID,
        variables: { userId },
        fetchPolicy: 'network-only',
      });

      const administrator = result.data?.administratorByUserId;
      if (administrator) {
        const userDetails: UserDetails = {
          id: administrator.id,
          firstName: administrator.firstName,
          lastName: administrator.lastName,
          emailAddress: administrator.emailAddress,
          createdAt: administrator.createdAt,
          updatedAt: administrator.updatedAt,
          user: administrator.user
            ? {
                id: administrator.user.id,
                identifier: administrator.user.identifier,
                verified: administrator.user.verified,
                lastLogin: administrator.user.lastLogin || null,
                roles: administrator.user.roles.map((role) => ({
                  id: role.id,
                  code: role.code,
                  description: role.description ?? null,
                  permissions: role.permissions,
                  channels: role.channels.map((ch) => ({
                    id: ch.id,
                    code: ch.code,
                    token: ch.token,
                  })),
                })),
              }
            : null,
        };
        this.currentUserSignal.set(userDetails);
        return userDetails;
      }

      this.errorSignal.set('Administrator not found');
      return null;
    } catch (error: any) {
      console.error('❌ Failed to fetch administrator by user ID:', error);
      this.errorSignal.set(error.message || 'Failed to fetch administrator');
      this.currentUserSignal.set(null);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * Clear current user
   */
  clearCurrentUser(): void {
    this.currentUserSignal.set(null);
  }
}
