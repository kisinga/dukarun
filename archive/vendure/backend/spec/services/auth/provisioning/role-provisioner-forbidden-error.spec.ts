/**
 * Role Provisioner ForbiddenError Test
 *
 * Tests the actual failure scenario where RoleService.create() fails with ForbiddenError
 * even when seller is set on RequestContext. This reproduces the real-world error.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  Channel,
  ID,
  Permission,
  RequestContext,
  Role,
  RoleService,
  Seller,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { RoleProvisionerService } from '../../../../src/services/auth/provisioning/role-provisioner.service';
import { RegistrationInput } from '../../../../src/services/auth/registration.service';
import { ProvisioningContextAdapter } from '../../../../src/services/provisioning/context-adapter.service';

// Mock environment config
jest.mock('../../../../src/infrastructure/config/environment.config', () => ({
  env: {
    superadmin: {
      username: 'test-superadmin',
      password: 'test-password',
    },
    auditDb: {
      host: 'localhost',
      port: 5432,
      name: 'test_audit',
      username: 'test',
      password: 'test',
    },
    db: {
      host: 'localhost',
      port: 5432,
      name: 'test',
      username: 'test',
      password: 'test',
    },
  },
}));

// Mock seller-access utility to simulate real behavior
jest.mock('../../../../src/utils/seller-access.util', () => ({
  withSellerFromChannel: jest.fn(),
  getSellerForChannel: jest.fn(),
}));

describe('RoleProvisionerService - ForbiddenError Scenario', () => {
  let service: RoleProvisionerService;
  let roleService: jest.Mocked<RoleService>;
  let contextAdapter: jest.Mocked<ProvisioningContextAdapter>;
  let connection: jest.Mocked<TransactionalConnection>;
  let roleRepo: any;

  const mockSeller: Seller = {
    id: 'seller-1',
    name: 'Test Company Seller',
  } as Seller;

  const mockChannel: Channel = {
    id: '2',
    code: 'test-company',
    token: 'test-company',
    seller: mockSeller,
  } as Channel;

  const mockSuperadminUser: User = {
    id: 'superadmin-id',
    identifier: 'superadmin',
    roles: [],
    verified: true,
    getNativeAuthenticationMethod: jest.fn(),
  } as unknown as User;

  const mockCtx: RequestContext = {
    channelId: '2',
    activeUserId: 'superadmin-id',
    languageCode: 'en',
    channel: mockChannel,
    user: mockSuperadminUser,
    isAuthorized: true,
  } as unknown as RequestContext;

  const registrationData: RegistrationInput = {
    companyName: 'Test Company',
    // companyCode is NOT part of input - backend generates it from companyName
    currency: 'USD',
    adminFirstName: 'Jane',
    adminLastName: 'Doe',
    adminPhoneNumber: '0712345678',
    storeName: 'Main Store',
    storeAddress: '123 Market Street',
  };

  beforeEach(() => {
    // Mock RoleService that simulates the actual ForbiddenError
    roleService = {
      create: jest.fn(async (ctx: RequestContext, input: any) => {
        // Simulate getPermittedChannels() check
        // This is what actually fails in production
        const seller = (ctx as any).seller;
        const user = (ctx as any).user;

        // The actual check that fails: getPermittedChannels() needs both user AND seller
        // Just having seller is not enough - the user must be able to access channels with this seller
        if (!seller) {
          return {
            errorCode: 'error.forbidden',
            message: 'Forbidden - no seller on context',
          };
        }

        // Even with seller, if user doesn't have access to channels with this seller, it fails
        // This is the actual failure scenario we're testing
        if (!user || !user.roles || user.roles.length === 0) {
          return {
            errorCode: 'error.forbidden',
            message: 'Forbidden - user has no roles or cannot access channels',
          };
        }

        // Check if user's roles have channels that match the seller
        // This is what getPermittedChannels() does internally
        const userCanAccessChannel =
          user.roles?.some((role: any) =>
            role.channels?.some((ch: any) => ch.seller?.id === seller.id)
          ) ?? false;

        if (!userCanAccessChannel && seller.id !== 'superadmin-seller') {
          // This is the actual failure: user doesn't have a role with channels matching this seller
          return {
            errorCode: 'error.forbidden',
            message: 'Forbidden - user cannot access channels with this seller',
          };
        }

        // Success case
        return {
          id: 6,
          code: input.code,
          description: input.description,
          permissions: input.permissions,
          channels: [{ id: 2 }],
        } as Role;
      }),
    } as any;

    // Mock ProvisioningContextAdapter to simulate the actual implementation
    // This should set both channel and seller, and ensure user can access channel
    contextAdapter = {
      withSellerScope: jest.fn(async (ctx: RequestContext, channelId: ID, fn: any) => {
        // Simulate the actual implementation:
        // 1. Load channel with seller
        // 2. Set channel on context
        // 3. Set seller on context
        // 4. Ensure user can access channel (for superadmin, add channel to roles)
        const seller = mockSeller;
        (ctx as any).seller = seller;
        (ctx as any).channel = mockChannel;
        (ctx as any).channelId = channelId;

        // For superadmin users, ensure their roles include the channel
        const user = (ctx as any).user as User | undefined;
        if (user && user.roles) {
          const isSuperAdmin = user.roles.some(
            (role: any) => !role.channels || role.channels.length === 0
          );
          if (isSuperAdmin) {
            // Temporarily add channel to superadmin roles
            for (const role of user.roles) {
              if (!role.channels || role.channels.length === 0) {
                (role as any).channels = [mockChannel];
              }
            }
          }
        }

        try {
          return await fn(ctx);
        } finally {
          delete (ctx as any).seller;
          // Note: channel restoration is handled by withChannel wrapper in real implementation
        }
      }),
      validateChannelExists: jest.fn(),
      validateSellerExists: jest.fn(),
      validateAdministratorExists: jest.fn(),
      getContextInfo: jest.fn(),
    } as any;

    roleRepo = {
      findOne: (jest.fn() as any).mockResolvedValue({
        id: 6,
        code: 'test-company-admin',
        channels: [{ id: '2' }],
      }),
      create: jest.fn((data: any) => ({ ...data, id: 6 })),
      save: jest
        .fn()
        .mockImplementation(async (entity: any) => ({ ...entity, id: entity.id || 6 })),
    };

    connection = {
      getRepository: jest.fn().mockReturnValue(roleRepo),
    } as any;

    const auditor = {
      logEntityCreated: jest.fn(),
    };

    const errorService = {
      logError: jest.fn(),
      wrapError: jest.fn((error: any) => error),
      createError: jest.fn((code: string, message: string) => new Error(`${code}: ${message}`)),
    };

    const eventBus = {
      publish: jest.fn(),
    } as any;

    service = new RoleProvisionerService(
      connection,
      eventBus,
      auditor as any,
      errorService as any,
      contextAdapter
    );
  });

  describe('Repository Bootstrap pattern (bypasses RoleService permission checks)', () => {
    it('should succeed even when superadmin user has no roles with channels matching seller', async () => {
      // With Repository Bootstrap pattern, we bypass RoleService permission checks
      // So the service should succeed regardless of user's role-channel access
      const ctxWithSuperadminButNoMatchingRoles = {
        ...mockCtx,
        user: {
          ...mockSuperadminUser,
          roles: [], // No roles = would fail with RoleService, but succeeds with repository
          getNativeAuthenticationMethod: jest.fn(),
        } as unknown as User,
      } as unknown as RequestContext;

      const result = await service.createAdminRole(
        ctxWithSuperadminButNoMatchingRoles,
        registrationData,
        '2',
        'test-company' // Mock company code
      );

      // Should succeed because we use repository directly
      expect(result).toBeDefined();
      expect(result.id).toBe(6);
      expect(result.code).toBe('test-company-admin');
      // Verify repository.save was called (not RoleService.create)
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('should succeed even when context has seller but user roles do not include channels with that seller', async () => {
      // With Repository Bootstrap pattern, we bypass RoleService permission checks
      // So the service should succeed regardless of user's role-channel access
      const ctxWithWrongSeller = {
        ...mockCtx,
        user: {
          ...mockSuperadminUser,
          roles: [
            {
              id: 'role-1',
              channels: [
                {
                  id: 'other-channel',
                  seller: { id: 'other-seller' } as Seller,
                } as Channel,
              ],
            },
          ],
          getNativeAuthenticationMethod: jest.fn(),
        } as unknown as User,
      } as unknown as RequestContext;

      const result = await service.createAdminRole(ctxWithWrongSeller, registrationData, '2', 'test-company');

      // Should succeed because we use repository directly
      expect(result).toBeDefined();
      expect(result.id).toBe(6);
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('should succeed when user has roles with channels matching the seller', async () => {
      // User has a role with channels that match the seller
      const ctxWithMatchingRoles = {
        ...mockCtx,
        user: {
          ...mockSuperadminUser,
          roles: [
            {
              id: 'role-1',
              channels: [
                {
                  id: '2',
                  seller: mockSeller,
                } as Channel,
              ],
            },
          ],
          getNativeAuthenticationMethod: jest.fn(),
        } as unknown as User,
      } as unknown as RequestContext;

      const result = await service.createAdminRole(ctxWithMatchingRoles, registrationData, '2', 'test-company');

      expect(result).toBeDefined();
      expect(result.id).toBe(6);
      // Verify repository.save was called (not RoleService.create)
      expect(roleRepo.save).toHaveBeenCalled();
    });
  });
});
