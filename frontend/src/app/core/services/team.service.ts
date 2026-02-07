import { Injectable, inject, signal } from '@angular/core';
import {
  GET_ADMINISTRATORS,
  GET_ROLE_TEMPLATES,
  CREATE_CHANNEL_ADMIN,
  UPDATE_CHANNEL_ADMIN,
  DISABLE_CHANNEL_ADMIN,
} from '../graphql/operations.graphql';
import type {
  GetAdministratorsQuery,
  GetRoleTemplatesQuery,
  CreateChannelAdminMutation,
  UpdateChannelAdminMutation,
  DisableChannelAdminMutation,
} from '../graphql/generated/graphql';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';

export interface RoleTemplate {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface Administrator {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress?: string | null;
  user?: {
    id: string;
    identifier: string;
    verified: boolean;
    roles?: Array<{
      id: string;
      code: string;
      permissions: string[];
      channels?: Array<{ id: string }>;
    }>;
  } | null;
}

export interface CreateChannelAdminInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  emailAddress?: string;
  roleTemplateCode: string;
  permissionOverrides?: string[];
}

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  // Signals for reactive state
  readonly members = signal<Administrator[]>([]);
  readonly roleTemplates = signal<RoleTemplate[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Load all team members for the active channel
   */
  async loadMembers(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const company = this.companyService.activeCompany();
      if (!company?.id) {
        this.error.set('No active channel');
        this.members.set([]);
        return;
      }
      const channelId = company.id;

      const client = this.apolloService.getClient();
      const result = await client.query<GetAdministratorsQuery>({
        query: GET_ADMINISTRATORS,
        variables: {
          options: {
            filter: {
              // Filter by channel - administrators with roles assigned to this channel
              // Note: This filtering might need adjustment based on actual GraphQL schema
            },
          },
        },
        fetchPolicy: 'network-only',
      });

      const admins = result.data?.administrators.items ?? [];

      // Filter to only admins that belong to the current channel
      // Also filter out superadmins (identified by role code or roles with no channel restrictions)
      const channelAdmins = admins
        .filter((admin) => {
          const roles = admin.user?.roles ?? [];

          // Exclude superadmins by checking role code (SuperAdmin role code is '__super_admin_role__')
          const isSuperAdmin = roles.some((role) => {
            const roleCode = role.code?.toLowerCase() || '';
            return roleCode === '__super_admin_role__' || roleCode.includes('superadmin');
          });

          if (isSuperAdmin) {
            return false;
          }

          // Include only admins that belong to the current channel (coerce ID for type-safe comparison)
          return roles.some((role) =>
            role.channels?.some((ch) => String(ch.id) === String(channelId)),
          );
        })
        .map((admin) => ({
          ...admin,
          user: admin.user
            ? {
                ...admin.user,
                verified: admin.user.verified ?? false,
                roles: admin.user.roles?.map((role) => ({
                  id: role.id,
                  code: role.code,
                  channels: role.channels ?? [],
                })),
              }
            : null,
        })) as Administrator[];

      this.members.set(channelAdmins);
    } catch (err) {
      console.error('Failed to load team members:', err);
      this.error.set('Failed to load team members');
      this.members.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Load available role templates
   */
  async loadRoleTemplates(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetRoleTemplatesQuery>({
        query: GET_ROLE_TEMPLATES,
        fetchPolicy: 'network-only',
      });

      const templates = result.data?.roleTemplates ?? [];
      this.roleTemplates.set(templates as RoleTemplate[]);
    } catch (err) {
      console.error('Failed to load role templates:', err);
      this.error.set('Failed to load role templates');
      this.roleTemplates.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Create a new team member
   */
  async createMember(input: CreateChannelAdminInput): Promise<Administrator> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const company = this.companyService.activeCompany();
      if (!company?.id) {
        const errorMessage = 'No active channel';
        this.error.set(errorMessage);
        throw new Error(errorMessage);
      }
      const client = this.apolloService.getClient();
      const result = await client.mutate<CreateChannelAdminMutation>({
        mutation: CREATE_CHANNEL_ADMIN,
        variables: { input },
      });

      // Check for Apollo Client errors
      if (result.error) {
        console.error('GraphQL error creating team member:', result.error);
        throw new Error(result.error.message || 'Failed to create team member');
      }

      // Check if mutation returned data
      if (!result.data?.createChannelAdmin) {
        console.error('No data returned from createChannelAdmin mutation:', result);
        throw new Error('Failed to create team member: No data returned');
      }

      const admin = result.data.createChannelAdmin;
      // Map GraphQL response to Administrator interface
      const newMember: Administrator = {
        ...admin,
        user: admin.user
          ? {
              ...admin.user,
              verified: false, // Default to false if not provided
              roles: admin.user.roles?.map((role) => ({
                id: role.id,
                code: role.code,
                permissions: role.permissions ?? [],
                channels: [],
              })),
            }
          : null,
      };

      // Reload members to get updated list
      await this.loadMembers();

      return newMember;
    } catch (err: any) {
      console.error('Failed to create team member:', err);
      console.error('Error details:', {
        message: err?.message,
        graphQLErrors: err?.graphQLErrors,
        networkError: err?.networkError,
      });

      // Extract error message from various sources
      let errorMessage =
        err?.graphQLErrors?.[0]?.message ||
        err?.networkError?.message ||
        (err instanceof Error ? err.message : 'Failed to create team member');
      if (
        typeof errorMessage === 'string' &&
        errorMessage.includes('not currently authorized to perform this action')
      ) {
        errorMessage = "Permission denied. Make sure you're in the correct company and try again.";
      }
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Update team member permissions
   */
  async updateMember(id: string, permissions: string[]): Promise<Administrator> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<UpdateChannelAdminMutation>({
        mutation: UPDATE_CHANNEL_ADMIN,
        variables: { id, permissions },
      });

      if (!result.data?.updateChannelAdmin) {
        throw new Error('Failed to update team member');
      }

      const admin = result.data.updateChannelAdmin;
      // Map GraphQL response to Administrator interface
      const updatedMember: Administrator = {
        ...admin,
        user: admin.user
          ? {
              ...admin.user,
              verified: false, // Default to false if not provided
              roles: admin.user.roles?.map((role) => ({
                id: role.id,
                code: role.code,
                permissions: role.permissions ?? [],
                channels: [],
              })),
            }
          : null,
      };

      // Reload members to get updated list
      await this.loadMembers();

      return updatedMember;
    } catch (err) {
      console.error('Failed to update team member:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update team member';
      this.error.set(errorMessage);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Delete (disable) a team member
   */
  async deleteMember(id: string): Promise<boolean> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<DisableChannelAdminMutation>({
        mutation: DISABLE_CHANNEL_ADMIN,
        variables: { id },
      });

      if (!result.data?.disableChannelAdmin?.success) {
        throw new Error('Failed to delete team member');
      }

      // Reload members to get updated list
      await this.loadMembers();

      return true;
    } catch (err) {
      console.error('Failed to delete team member:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete team member';
      this.error.set(errorMessage);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }
}
