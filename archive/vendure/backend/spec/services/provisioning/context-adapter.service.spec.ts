import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  Administrator,
  Channel,
  RequestContext,
  Role,
  Seller,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { ProvisioningContextAdapter } from '../../../src/services/provisioning/context-adapter.service';
import * as sellerAccessUtil from '../../../src/utils/seller-access.util';
import * as requestContextUtil from '../../../src/utils/request-context.util';

// Mock the seller-access utility
jest.mock('../../../src/utils/seller-access.util', () => ({
  withSellerFromChannel: jest.fn(),
  getSellerForChannel: jest.fn(),
}));

// Mock the request-context utility
jest.mock('../../../src/utils/request-context.util', () => ({
  withChannel: jest.fn(),
}));

describe('ProvisioningContextAdapter', () => {
  let service: ProvisioningContextAdapter;
  let connection: any;

  const mockChannel: Channel = {
    id: '2',
    code: 'test-channel',
    token: 'test-token',
    seller: {
      id: 'seller-1',
      name: 'Test Seller',
    } as Seller,
  } as Channel;

  const mockSeller: Seller = {
    id: 'seller-1',
    name: 'Test Seller',
  } as Seller;

  const mockCtx: RequestContext = {
    channelId: '2',
    activeUserId: undefined,
    languageCode: 'en',
    channel: mockChannel,
  } as unknown as RequestContext;

  beforeEach(() => {
    const channelRepo = {
      findOne: jest.fn(),
    };

    const sellerRepo = {
      findOne: jest.fn(),
    };

    const adminRepo = {
      findOne: jest.fn(),
    };

    connection = {
      getRepository: jest.fn((ctx: RequestContext, entity: any) => {
        if (entity === Channel) return channelRepo;
        if (entity === Seller) return sellerRepo;
        if (entity === Administrator) return adminRepo;
        return channelRepo; // default
      }),
    };

    service = new ProvisioningContextAdapter(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('withSellerScope', () => {
    it('should execute function with seller-scoped context', async () => {
      const mockFn: any = (jest.fn() as any).mockResolvedValue('result');
      const mockCtxWithChannel = { ...mockCtx } as any;
      const mockCtxWithSeller = { ...mockCtxWithChannel } as any;
      (mockCtxWithSeller as any).seller = mockSeller;

      (requestContextUtil.withChannel as jest.Mock).mockImplementation(
        async (ctx: any, channel: any, fn: any) => {
          return await fn(mockCtxWithChannel);
        }
      );

      (sellerAccessUtil.withSellerFromChannel as any).mockImplementation(
        async (ctx: any, channelId: any, conn: any, fn: any) => {
          return await fn(mockCtxWithSeller);
        }
      );

      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(mockChannel);

      const result = await service.withSellerScope(mockCtx, '2', mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledWith(mockCtxWithSeller);
      expect(sellerAccessUtil.withSellerFromChannel).toHaveBeenCalledWith(
        mockCtxWithChannel,
        '2',
        connection,
        expect.any(Function)
      );
    });

    it('should validate channel exists before executing', async () => {
      const mockFn: any = (jest.fn() as any).mockResolvedValue('result');
      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(null);

      await expect(service.withSellerScope(mockCtx, '2', mockFn)).rejects.toThrow(
        'Channel 2 not found'
      );

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should enable debug logging when option is set', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'debug');
      const mockFn: any = (jest.fn() as any).mockResolvedValue('result');
      const mockCtxWithChannel = { ...mockCtx } as any;
      const mockCtxWithSeller = { ...mockCtxWithChannel } as any;
      (mockCtxWithSeller as any).seller = mockSeller;

      (requestContextUtil.withChannel as jest.Mock).mockImplementation(
        async (ctx: any, channel: any, fn: any) => {
          return await fn(mockCtxWithChannel);
        }
      );

      (sellerAccessUtil.withSellerFromChannel as any).mockImplementation(
        async (ctx: any, channelId: any, conn: any, fn: any) => {
          return await fn(mockCtxWithSeller);
        }
      );

      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(mockChannel);

      await service.withSellerScope(mockCtx, '2', mockFn, {
        enableDebugLogging: true,
        operationName: 'test-operation',
      });

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('[test-operation]'));
    });

    it('should log errors on failure', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const mockFn: any = (jest.fn() as any).mockRejectedValue(new Error('Test error'));
      const mockCtxWithChannel = { ...mockCtx } as any;
      const mockCtxWithSeller = { ...mockCtxWithChannel } as any;
      (mockCtxWithSeller as any).seller = mockSeller;

      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(mockChannel);

      (requestContextUtil.withChannel as jest.Mock).mockImplementation(
        async (ctx: any, channel: any, fn: any) => {
          return await fn(mockCtxWithChannel);
        }
      );

      (sellerAccessUtil.withSellerFromChannel as any).mockImplementation(
        async (ctx: any, channelId: any, conn: any, fn: any) => {
          return await fn(mockCtx);
        }
      );

      await expect(service.withSellerScope(mockCtx, '2', mockFn)).rejects.toThrow('Test error');

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed for channel 2'));
    });
  });

  describe('validateChannelExists', () => {
    it('should pass when channel exists with seller', async () => {
      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(mockChannel);

      await expect(service.validateChannelExists(mockCtx, '2')).resolves.not.toThrow();
    });

    it('should throw when channel does not exist', async () => {
      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(null);

      await expect(service.validateChannelExists(mockCtx, '2')).rejects.toThrow(
        'Channel 2 not found'
      );
    });

    it('should throw when channel has no seller', async () => {
      const channelWithoutSeller = { ...mockChannel, seller: null };
      const channelRepo: any = connection.getRepository(mockCtx, Channel);
      channelRepo.findOne.mockResolvedValue(channelWithoutSeller);

      await expect(service.validateChannelExists(mockCtx, '2')).rejects.toThrow(
        'Channel 2 has no seller associated'
      );
    });
  });

  describe('validateSellerExists', () => {
    it('should return seller when it exists', async () => {
      const sellerRepo: any = connection.getRepository(mockCtx, Seller);
      sellerRepo.findOne.mockResolvedValue(mockSeller);

      const result = await service.validateSellerExists(mockCtx, 'seller-1');

      expect(result).toBe(mockSeller);
    });

    it('should throw when seller does not exist', async () => {
      const sellerRepo: any = connection.getRepository(mockCtx, Seller);
      sellerRepo.findOne.mockResolvedValue(null);

      await expect(service.validateSellerExists(mockCtx, 'seller-1')).rejects.toThrow(
        'Seller seller-1 not found'
      );
    });
  });

  describe('validateAdministratorExists', () => {
    it('should return administrator when it exists', async () => {
      const mockAdmin = {
        id: 'admin-1',
        emailAddress: 'admin@test.com',
        user: { id: 'user-1' },
      };

      const adminRepo: any = connection.getRepository(mockCtx, Administrator);
      adminRepo.findOne.mockResolvedValue(mockAdmin);

      const result = await service.validateAdministratorExists(mockCtx, 'admin-1');

      expect(result).toBe(mockAdmin);
    });

    it('should throw when administrator does not exist', async () => {
      const adminRepo: any = connection.getRepository(mockCtx, Administrator);
      adminRepo.findOne.mockResolvedValue(null);

      await expect(service.validateAdministratorExists(mockCtx, 'admin-1')).rejects.toThrow(
        'Administrator admin-1 not found'
      );
    });
  });

  describe('getContextInfo', () => {
    it('should return structured context information', () => {
      const ctxWithSeller = {
        ...mockCtx,
        seller: mockSeller,
        activeUserId: 'user-1',
        apiType: 'admin',
        isAuthorized: true,
      } as any;

      const info = service.getContextInfo(ctxWithSeller);

      expect(info).toEqual({
        channelId: '2',
        activeUserId: 'user-1',
        sellerId: 'seller-1',
        apiType: 'admin',
        isAuthorized: true,
      });
    });

    it('should handle context without seller', () => {
      const info = service.getContextInfo(mockCtx);

      expect(info.sellerId).toBeUndefined();
      expect(info.channelId).toBe('2');
    });
  });

  describe('ensureUserCanAccessChannel (via withSellerScope)', () => {
    it('should load user and add channel to superadmin roles', async () => {
      const mockSuperadminUser: User = {
        id: 'superadmin-id',
        identifier: 'superadmin',
        roles: [
          {
            id: 'role-1',
            code: 'SuperAdmin',
            channels: [], // Superadmin role with no channels
          } as unknown as Role,
        ],
        verified: true,
      } as unknown as User;

      const mockCtxWithUser: RequestContext = {
        ...mockCtx,
        activeUserId: 'superadmin-id',
        user: mockSuperadminUser,
      } as unknown as RequestContext;

      const userRepo: any = {
        findOne: (jest.fn() as any).mockResolvedValue(mockSuperadminUser),
      };

      connection.getRepository = jest.fn((ctx: RequestContext, entity: any) => {
        if (entity === Channel) {
          return {
            findOne: (jest.fn() as any).mockResolvedValue(mockChannel),
          };
        }
        if (entity === User) {
          return userRepo;
        }
        return {};
      }) as any;

      (requestContextUtil.withChannel as jest.Mock).mockImplementation(
        async (ctx: any, channel: any, fn: any) => {
          (ctx as any).channel = channel;
          (ctx as any).channelId = channel.id;
          return await fn(ctx);
        }
      );

      (sellerAccessUtil.withSellerFromChannel as jest.Mock).mockImplementation(
        async (ctx: any, channelId: any, conn: any, fn: any) => {
          (ctx as any).seller = mockSeller;
          return await fn(ctx);
        }
      );

      const mockFn: any = (jest.fn() as any).mockResolvedValue('result');

      await service.withSellerScope(mockCtxWithUser, '2', mockFn);

      // Verify user was loaded with roles and channels
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'superadmin-id' },
        relations: ['roles', 'roles.channels'],
      });

      // Verify the function was called
      expect(mockFn).toHaveBeenCalled();

      // Verify the user's roles were modified (channel added)
      const contextPassedToFn = mockFn.mock.calls[0][0] as RequestContext;
      const userInContext = (contextPassedToFn as any).user as User;
      expect(userInContext).toBeDefined();
      expect(userInContext.roles).toBeDefined();
      expect(userInContext.roles?.length).toBeGreaterThan(0);

      // Check that the superadmin role now has the channel
      const superadminRole = userInContext.roles?.find(r => r.code === 'SuperAdmin');
      expect(superadminRole).toBeDefined();
      expect(superadminRole?.channels).toBeDefined();
      expect(superadminRole?.channels?.length).toBe(1);
      expect(superadminRole?.channels?.[0].id).toBe('2');
    });

    it('should not modify user roles if user already has access', async () => {
      const mockUserWithAccess: User = {
        id: 'user-id',
        identifier: 'user',
        roles: [
          {
            id: 'role-1',
            code: 'Admin',
            channels: [mockChannel], // User already has access to this channel
          } as Role,
        ],
        verified: true,
      } as unknown as User;

      const mockCtxWithUser: RequestContext = {
        ...mockCtx,
        activeUserId: 'user-id',
        user: mockUserWithAccess,
      } as unknown as RequestContext;

      const userRepo: any = {
        findOne: (jest.fn() as any).mockResolvedValue(mockUserWithAccess),
      };

      connection.getRepository = jest.fn((ctx: RequestContext, entity: any) => {
        if (entity === Channel) {
          return {
            findOne: (jest.fn() as any).mockResolvedValue(mockChannel),
          };
        }
        if (entity === User) {
          return userRepo;
        }
        return {};
      }) as any;

      (requestContextUtil.withChannel as jest.Mock).mockImplementation(
        async (ctx: any, channel: any, fn: any) => {
          (ctx as any).channel = channel;
          (ctx as any).channelId = channel.id;
          return await fn(ctx);
        }
      );

      (sellerAccessUtil.withSellerFromChannel as jest.Mock).mockImplementation(
        async (ctx: any, channelId: any, conn: any, fn: any) => {
          (ctx as any).seller = mockSeller;
          return await fn(ctx);
        }
      );

      const mockFn: any = (jest.fn() as any).mockResolvedValue('result');

      await service.withSellerScope(mockCtxWithUser, '2', mockFn);

      // Verify user was loaded
      expect(userRepo.findOne).toHaveBeenCalled();

      // Verify the function was called
      expect(mockFn).toHaveBeenCalled();

      // Verify the user's roles were not modified (user already has access)
      const contextPassedToFn = mockFn.mock.calls[0][0] as RequestContext;
      const userInContext = (contextPassedToFn as any).user as User;
      expect(userInContext).toBeDefined();
      expect(userInContext.roles).toBeDefined();

      // User should still have only one channel (the original one)
      const adminRole = userInContext.roles?.find(r => r.code === 'Admin');
      expect(adminRole).toBeDefined();
      expect(adminRole?.channels?.length).toBe(1);
    });
  });
});
