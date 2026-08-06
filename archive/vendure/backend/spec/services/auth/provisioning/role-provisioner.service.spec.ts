import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  Channel,
  Permission,
  RequestContext,
  Role,
  RoleService,
  Seller,
  User,
} from '@vendure/core';
import { RoleProvisionerService } from '../../../../src/services/auth/provisioning/role-provisioner.service';
import { RegistrationInput } from '../../../../src/services/auth/registration.service';

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

// Mock seller-access utility
jest.mock('../../../../src/utils/seller-access.util', () => ({
  withSellerFromChannel: jest.fn(
    async (
      ctx: RequestContext,
      channelId: any,
      connection: any,
      fn: (ctx: RequestContext) => Promise<any>
    ) => {
      // Mock seller for channel
      const mockSeller = { id: 'seller-1', name: 'Test Seller' } as Seller;
      // Set seller on context
      (ctx as any).seller = mockSeller;
      try {
        return await fn(ctx);
      } finally {
        delete (ctx as any).seller;
      }
    }
  ),
}));

const buildService = () => {
  const roleService = {
    create: jest.fn(async (ctx: RequestContext, input: any) => {
      // Simulate permission check - will pass if seller is set on context
      const seller = (ctx as any).seller;
      if (!seller) {
        return { errorCode: 'error.forbidden', message: 'Forbidden - no seller' };
      }
      return {
        id: 6,
        code: input.code,
        description: input.description,
        permissions: input.permissions,
        channels: [{ id: 2 }],
      } as Role;
    }),
  };

  const channelService = {
    findOne: jest.fn(async (ctx: RequestContext, id: any) => {
      return { id: 2, token: 'channel-token' } as Channel;
    }),
  };

  // Track created roles for repository fallback - shared across all repository instances
  const createdRoles = new Map<any, any>();

  // Create a single repository instance that will be reused
  const roleRepository = {
    create: jest.fn((data: any) => {
      const role = { ...data, id: 6 };
      createdRoles.set(6, role);
      return role;
    }),
    save: jest.fn(async (entity: any) => {
      const saved = { ...entity, id: entity.id || 6 };
      // If channels are being added, preserve them
      if (entity.channels) {
        saved.channels = entity.channels;
      }
      createdRoles.set(saved.id, saved);
      return saved;
    }),
    findOne: jest.fn(async (options: any) => {
      const roleId = options.where?.id || options.where?.id;
      if (roleId === 6 || createdRoles.has(6)) {
        const role = createdRoles.get(6) || { id: 6, code: 'test-company-admin', permissions: [] };
        const result = { ...role };
        if (options.relations?.includes('channels')) {
          result.channels = role.channels || [{ id: 2 }];
        }
        return result;
      }
      return null;
    }),
  };

  const connection = {
    getRepository: jest.fn((ctx: RequestContext, entity: any) => {
      if (entity === Role) {
        return roleRepository;
      }
      if (entity === Channel) {
        return {
          findOne: jest.fn(async (options: any) => {
            if (options.where?.id === 2) {
              return {
                id: 2,
                token: 'channel-token',
                seller: { id: 'seller-1', name: 'Test Seller' },
              } as Channel;
            }
            return null;
          }),
        };
      }
      return {
        create: jest.fn((data: any) => data),
        save: jest.fn(async (entity: any) => entity),
        findOne: jest.fn(async () => null),
      };
    }),
  };

  const superadminUser = {
    id: 'superadmin-id',
    identifier: 'superadmin',
    roles: [],
    deletedAt: null,
    authenticationMethods: [],
    verified: true,
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customFields: {},
    sessions: [],
    getNativeAuthenticationMethod: jest.fn(),
  } as unknown as User;

  const userService = {
    getUserByEmailAddress: jest.fn(async (ctx: RequestContext, email: string) => {
      // Support both 'superadmin' and 'test-superadmin' for flexibility
      if (email === 'superadmin' || email === 'test-superadmin') {
        return superadminUser;
      }
      return null;
    }),
  };

  const auditor = {
    logEntityCreated: jest.fn(async () => undefined),
  };

  const errorService = {
    logError: jest.fn(),
    wrapError: jest.fn((error: any) => error),
    createError: jest.fn((code: string, message: string) => new Error(`${code}: ${message}`)),
  };

  const eventBus = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const contextAdapter = {
    withSellerScope: jest.fn(
      async (ctx: RequestContext, channelId: any, fn: any, options?: any) => {
        // Use the existing withSellerFromChannel mock behavior
        // This ensures compatibility with existing test expectations
        const mockSeller = { id: 'seller-1', name: 'Test Seller' } as Seller;
        (ctx as any).seller = mockSeller;
        try {
          return await fn(ctx);
        } finally {
          delete (ctx as any).seller;
        }
      }
    ),
  };

  const service = new RoleProvisionerService(
    connection as any,
    eventBus as any,
    auditor as any,
    errorService as any,
    contextAdapter as any
  );

  return {
    service,
    roleService,
    channelService,
    connection,
    roleRepository, // Expose roleRepository for test assertions
    userService,
    auditor,
    errorService,
    eventBus,
    contextAdapter,
    superadminUser,
  };
};

describe('RoleProvisionerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const publicCtx = {
    activeUserId: undefined,
    channelId: 2,
    languageCode: 'en',
    channel: { id: 2, token: 'channel-token' },
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

  describe('createAdminRole', () => {
    it('should create role using repository directly (Repository Bootstrap pattern)', async () => {
      const harness = buildService();

      const result = await harness.service.createAdminRole(
        publicCtx,
        registrationData,
        2,
        'test-company'
      );

      // Verify repository.save was called (Repository Bootstrap pattern)
      expect(harness.roleRepository.save).toHaveBeenCalled();

      // Verify role was created with correct properties
      expect(result.id).toBe(6);
      expect(result.code).toBe('test-company-admin');
      expect(result.description).toContain('Test Company');
      expect(result.permissions).toContain(Permission.CreateAsset);
      expect(result.channels).toBeDefined();
      expect(result.channels?.length).toBe(1);
      expect(result.channels?.[0].id).toBe(2);

      // Verify event was published
      expect(harness.eventBus.publish).toHaveBeenCalled();
    });

    it('should create role with all admin permissions', async () => {
      const harness = buildService();

      const result = await harness.service.createAdminRole(
        publicCtx,
        registrationData,
        2,
        'test-company'
      );

      // Verify repository.save was called
      expect(harness.roleRepository.save).toHaveBeenCalled();

      // Verify all required permissions are included
      expect(result.permissions).toContain(Permission.CreateAsset);
      expect(result.permissions).toContain(Permission.ReadAsset);
      expect(result.permissions).toContain(Permission.UpdateAsset);
      expect(result.permissions).toContain(Permission.DeleteAsset);
      expect(result.permissions).toContain(Permission.CreateOrder);
      expect(result.permissions).toContain(Permission.ReadOrder);
      expect(result.permissions).toContain(Permission.CreateStockLocation);
      expect(result.permissions).toContain(Permission.ReadStockLocation);
      expect(result.permissions).toContain(Permission.UpdateStockLocation);
    });

    it('should assign role to channel via channels array', async () => {
      const harness = buildService();

      const result = await harness.service.createAdminRole(
        publicCtx,
        registrationData,
        2,
        'test-company'
      );

      // Verify role has channel assigned
      expect(result.channels).toBeDefined();
      expect(result.channels?.length).toBe(1);
      expect(result.channels?.[0].id).toBe(2);
    });

    it('should verify role-channel linkage after creation', async () => {
      const harness = buildService();

      await harness.service.createAdminRole(publicCtx, registrationData, 2, 'test-company');

      // Verify that verification was called (should call findOne with relations)
      // The verification happens in verifyRoleChannelLinkage
      const findOneCalls = harness.roleRepository.findOne.mock.calls;
      const verificationCall = findOneCalls.find(
        call => call[0]?.relations?.includes('channels') && call[0]?.where?.id === 6
      );

      expect(verificationCall).toBeDefined();
      if (verificationCall) {
        expect(verificationCall[0]).toMatchObject({
          where: { id: 6 },
          relations: ['channels'],
        });
      }
    });

    it('should throw error if repository.save() fails', async () => {
      const harness = buildService();

      // Make repository.save throw an error
      const dbError = new Error('Database error');
      harness.roleRepository.save.mockRejectedValueOnce(dbError);

      // Should throw error (wrapped by errorService.wrapError)
      await expect(
        harness.service.createAdminRole(publicCtx, registrationData, 2, 'test-company')
      ).rejects.toThrow();

      // Verify repository.save was attempted
      expect(harness.roleRepository.save).toHaveBeenCalled();
      // Verify error was logged
      expect(harness.errorService.logError).toHaveBeenCalled();
    });

    it('should audit log role creation', async () => {
      const harness = buildService();

      const result = await harness.service.createAdminRole(
        publicCtx,
        registrationData,
        2,
        'test-company'
      );

      expect(harness.auditor.logEntityCreated as jest.Mock<any>).toHaveBeenCalledWith(
        publicCtx,
        'Role',
        '6',
        result,
        expect.objectContaining({
          channelId: '2',
          companyCode: 'test-company',
          companyName: 'Test Company',
        })
      );
    });
  });

  describe('getAdminPermissions', () => {
    it('should return all required admin permissions', () => {
      const harness = buildService();
      const permissions = harness.service.getAdminPermissions();

      expect(permissions).toContain(Permission.CreateAsset);
      expect(permissions).toContain(Permission.ReadAsset);
      expect(permissions).toContain(Permission.UpdateAsset);
      expect(permissions).toContain(Permission.DeleteAsset);
      expect(permissions).toContain(Permission.CreateOrder);
      expect(permissions).toContain(Permission.ReadOrder);
      expect(permissions.length).toBeGreaterThan(20);
    });
  });
});
