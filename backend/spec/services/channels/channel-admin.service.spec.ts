/**
 * ChannelAdminService unit tests
 *
 * Ensures channel context is required and channel-id comparison is correct
 * so permission and channel-scoping bugs are caught before production.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Administrator, Channel, RequestContext, Role, User } from '@vendure/core';
import { ChannelAdminService } from '../../../src/services/channels/channel-admin.service';

describe('ChannelAdminService', () => {
  let service: ChannelAdminService;

  const mockConnection = {
    getRepository: jest.fn(),
    rawConnection: { getRepository: jest.fn() },
  };

  const mockRoleTemplateService = {
    getTemplateByCode: jest.fn(),
    findRoleByChannelAndTemplateId: jest.fn(),
    getAllTemplates: jest.fn(),
  };

  const mockChannelService = {
    findOne: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined as never),
  };

  const mockCommunicationService = {
    send: jest.fn().mockResolvedValue({ success: true } as never),
  };

  const mockPasswordCipher = {
    hash: jest.fn().mockResolvedValue('hashed' as never),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  const mockAdministratorService = {
    findOne: jest.fn(),
  };

  const mockRoleService = {
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChannelAdminService(
      mockAdministratorService as any,
      mockRoleService as any,
      mockConnection as any,
      mockAuditService as any,
      mockCommunicationService as any,
      mockChannelService as any,
      mockRoleTemplateService as any,
      mockPasswordCipher as any,
      mockEventBus as any
    );
  });

  describe('requireChannelId (channel context required)', () => {
    it('inviteChannelAdministrator throws when ctx.channelId is null', async () => {
      const ctx = { channelId: null } as unknown as RequestContext;
      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow('Channel context is required');
    });

    it('inviteChannelAdministrator throws when ctx.channelId is undefined', async () => {
      const ctx = { channelId: undefined } as unknown as RequestContext;
      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow('Channel context is required');
    });

    it('updateChannelAdministrator throws when ctx.channelId is null', async () => {
      const ctx = { channelId: null } as unknown as RequestContext;
      await expect(
        service.updateChannelAdministrator(ctx, { id: '1', permissions: [] })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateChannelAdministrator(ctx, { id: '1', permissions: [] })
      ).rejects.toThrow('Channel context is required');
    });

    it('disableChannelAdministrator throws when ctx.channelId is null', async () => {
      const ctx = { channelId: null } as unknown as RequestContext;
      await expect(service.disableChannelAdministrator(ctx, '1')).rejects.toThrow(
        BadRequestException
      );
      await expect(service.disableChannelAdministrator(ctx, '1')).rejects.toThrow(
        'Channel context is required'
      );
    });
  });

  describe('channelId comparison (string vs number)', () => {
    const createUserWithChannel = (channelId: string | number): User =>
      ({
        id: 100,
        identifier: '+254712345678',
        verified: true,
        roles: [
          {
            id: 1,
            code: 'admin',
            channels: [{ id: channelId } as Channel],
          } as Role,
        ],
      }) as unknown as User;

    it('existing user with role on channel 2 (number) is detected when ctx.channelId is number', async () => {
      const ctx = { channelId: 2 } as unknown as RequestContext;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(createUserWithChannel(2) as never),
      };
      mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
        if (entity === User) return userRepo;
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });

      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow('already belongs to this channel');
    });

    it('existing user with role on channel 2 (number) is detected when ctx.channelId is string', async () => {
      const ctx = { channelId: '2' } as unknown as RequestContext;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(createUserWithChannel(2) as never),
      };
      mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
        if (entity === User) return userRepo;
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });

      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow('already belongs to this channel');
    });

    it('existing user with role on channel 3 is not treated as belonging to channel 2', async () => {
      const ctx = { channelId: 2 } as unknown as RequestContext;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(createUserWithChannel(3) as never),
      };
      const adminQbChain = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([] as never),
      };
      mockChannelService.findOne.mockResolvedValue({ id: 2, customFields: {} } as never);
      mockRoleTemplateService.getTemplateByCode.mockResolvedValue({
        id: 'tpl-1',
        code: 'admin',
        name: 'Admin',
        permissions: ['ReadSettings', 'UpdateSettings'],
      } as never);
      mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
        if (entity === User) return userRepo;
        if (entity === Administrator) return { createQueryBuilder: () => adminQbChain };
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });

      await expect(
        service.inviteChannelAdministrator(ctx, {
          phoneNumber: '+254712345678',
          firstName: 'Jane',
          lastName: 'Doe',
          roleTemplateCode: 'admin',
        })
      ).rejects.toThrow(); // Fails later (e.g. role creation) but not "already belongs"
      expect(mockRoleTemplateService.getTemplateByCode).toHaveBeenCalled();
    });
  });
});
