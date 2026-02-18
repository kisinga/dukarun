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
        identifier: '0712345678',
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
        andWhere: jest.fn().mockReturnThis(),
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
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });
      mockConnection.rawConnection.getRepository.mockImplementation((entity: any) => {
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

  describe('getChannelAdminCount (limit check)', () => {
    it('count query excludes soft-deleted users and administrators', async () => {
      const ctx = { channelId: 2 } as unknown as RequestContext;
      const userWithChannel3 = {
        id: 100,
        identifier: '0712345678',
        verified: true,
        roles: [{ id: 1, code: 'admin', channels: [{ id: 3 } as Channel] } as Role],
      } as unknown as User;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(userWithChannel3 as never),
        save: jest.fn().mockImplementation((u: unknown) => Promise.resolve(u)),
      };
      const andWhereCalls: string[] = [];
      const adminQbChain: {
        innerJoin: ReturnType<typeof jest.fn>;
        where: ReturnType<typeof jest.fn>;
        andWhere: ReturnType<typeof jest.fn>;
        select: ReturnType<typeof jest.fn>;
        getRawMany: ReturnType<typeof jest.fn>;
      } = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockImplementation((clause: unknown) => {
          andWhereCalls.push(clause as string);
          return adminQbChain;
        }),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ admin_id: 1 }] as never),
      };
      mockChannelService.findOne.mockResolvedValue({
        id: 2,
        customFields: { maxAdminCount: 5 },
      } as never);
      mockRoleTemplateService.getTemplateByCode.mockResolvedValue({
        id: 'tpl-1',
        code: 'admin',
        name: 'Admin',
        permissions: ['ReadSettings', 'UpdateSettings'],
      } as never);
      mockRoleTemplateService.findRoleByChannelAndTemplateId.mockResolvedValue({
        id: 10,
        code: 'channel-2-tpl-1',
        channels: [{ id: 2 }],
      } as never);
      const savedAdmin = {
        id: '50',
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: '0712345678',
        user: { id: 100 },
      } as unknown as Administrator;
      mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
        if (entity === User) return userRepo;
        if (entity === Administrator)
          return {
            findOne: jest.fn().mockResolvedValueOnce(savedAdmin as never),
            save: jest.fn().mockResolvedValue(savedAdmin as never),
          };
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });
      mockConnection.rawConnection.getRepository.mockImplementation((entity: any) => {
        if (entity === Administrator) return { createQueryBuilder: () => adminQbChain };
        return { findOne: jest.fn(), save: jest.fn() };
      });

      await service.inviteChannelAdministrator(ctx, {
        phoneNumber: '+254712345678',
        firstName: 'Jane',
        lastName: 'Doe',
        roleTemplateCode: 'admin',
      });

      expect(andWhereCalls).toContain('user.deletedAt IS NULL');
      expect(andWhereCalls).toContain('admin.deletedAt IS NULL');
    });
  });

  describe('re-add after disable', () => {
    it('re-invite by phone after disable succeeds and returns an Administrator', async () => {
      const ctx = { channelId: 2 } as unknown as RequestContext;
      const existingUser = {
        id: 100,
        identifier: '0712345678',
        verified: true,
        roles: [], // cleared by disable
      } as unknown as User;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(existingUser as never),
        save: jest.fn().mockImplementation((u: unknown) => Promise.resolve(u as User)),
      };
      const adminQbChain = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ admin_id: 1 }] as never),
      };
      const newAdmin = {
        id: '99',
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: '0712345678',
        user: existingUser,
      } as unknown as Administrator;
      mockChannelService.findOne.mockResolvedValue({
        id: 2,
        customFields: { maxAdminCount: 5 },
      } as never);
      mockRoleTemplateService.getTemplateByCode.mockResolvedValue({
        id: 'tpl-1',
        code: 'admin',
        name: 'Admin',
        permissions: ['ReadSettings', 'UpdateSettings'],
      } as never);
      mockRoleTemplateService.findRoleByChannelAndTemplateId.mockResolvedValue({
        id: 10,
        code: 'channel-2-tpl-1',
        channels: [{ id: 2 }],
      } as never);
      const adminFindOne = jest
        .fn()
        .mockResolvedValue(null as never) // no existing Administrator (was removed on disable)
        .mockResolvedValueOnce(null as never);
      const adminSave = jest.fn().mockResolvedValue(newAdmin as never);
      mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
        if (entity === User) return userRepo;
        if (entity === Administrator) return { findOne: adminFindOne, save: adminSave };
        return { findOne: jest.fn().mockResolvedValue(null as never), save: jest.fn() };
      });
      mockConnection.rawConnection.getRepository.mockImplementation((entity: any) => {
        if (entity === Administrator) return { createQueryBuilder: () => adminQbChain };
        return { findOne: jest.fn(), save: jest.fn() };
      });

      const result = await service.inviteChannelAdministrator(ctx, {
        phoneNumber: '+254712345678',
        firstName: 'Jane',
        lastName: 'Doe',
        roleTemplateCode: 'admin',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('99');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(adminSave).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalled();
      const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as { type: string };
      expect(event.type).toBe('created');
    });
  });
});
