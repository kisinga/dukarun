import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { BatchMessagingService } from '../../../src/services/batch-messaging/batch-messaging.service';
import { BatchMessage } from '../../../src/services/batch-messaging/batch-message.entity';
import { CommunicationService } from '../../../src/infrastructure/communication/communication.service';
import { ChannelService } from '@vendure/core';
import { ChannelUserService } from '../../../src/services/auth/channel-user.service';
import { PlatformAuditService } from '../../../src/infrastructure/audit/platform-audit.service';
import { JobQueueService } from '@vendure/core';

describe('BatchMessagingService', () => {
  const ctx = { activeUserId: 'super-admin-1' } as RequestContext;
  let service: BatchMessagingService;
  let connection: any;
  let communicationService: any;
  let channelService: any;
  let channelUserService: any;
  let platformAuditService: any;
  let jobQueueService: any;
  let savedBatchMessages: BatchMessage[];
  let queuedJobs: Array<{ data: { batchMessageId: string } }>;

  function createAdmin(overrides?: {
    identifier?: string;
    customFields?: Record<string, unknown>;
  }) {
    return {
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'jane@example.com',
      user: {
        id: 'user-1',
        identifier: overrides?.identifier ?? 'jane@example.com',
        customFields: overrides?.customFields ?? { phoneNumber: '0712345678' },
        roles: [],
      },
    };
  }

  function createQueryBuilder(admins: any[]) {
    return jest.fn(() => ({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve(admins)),
    }));
  }

  function buildBatchMessageRepo() {
    return {
      save: jest.fn((msg: any) => {
        if (!msg.id) {
          msg.id = `batch-${savedBatchMessages.length + 1}`;
        }
        savedBatchMessages.push(msg);
        return Promise.resolve(msg);
      }),
      findOne: jest.fn(({ where }: any) => {
        const id = where?.id;
        return Promise.resolve(savedBatchMessages.find(m => m.id === id) ?? null);
      }),
      findAndCount: jest.fn(() => Promise.resolve([[], 0])),
    };
  }

  function setupConnection(admins: any[], users: any[] = []) {
    const batchMessageRepo = buildBatchMessageRepo();
    const adminRepo = {
      createQueryBuilder: createQueryBuilder(admins),
      find: jest.fn(() => Promise.resolve(admins)),
      findOne: jest.fn(() => Promise.resolve(admins[0] ?? null)),
    };
    const userRepo = {
      find: jest.fn(() => Promise.resolve(users)),
      findOne: jest.fn(() => Promise.resolve(users[0] ?? null)),
    };

    connection = {
      rawConnection: {
        getRepository: jest.fn((entity: any) => {
          if (entity === BatchMessage) return batchMessageRepo;
          const name = typeof entity === 'string' ? entity : entity?.name;
          if (name === 'Administrator') return adminRepo;
          if (name === 'User') return userRepo;
          return {
            find: jest.fn(() => Promise.resolve([])),
            findOne: jest.fn(() => Promise.resolve(null)),
          };
        }),
      },
    };
  }

  beforeEach(() => {
    savedBatchMessages = [];
    queuedJobs = [];

    communicationService = {
      send: jest.fn(() => Promise.resolve({ success: true, channel: 'whatsapp' })),
    };
    channelService = {};
    channelUserService = {};
    platformAuditService = {
      log: jest.fn(() => Promise.resolve()),
    };
    jobQueueService = {
      createQueue: jest.fn(({ process }: any) => {
        return {
          add: jest.fn((data: any) => {
            queuedJobs.push({ data });
            return Promise.resolve();
          }),
          process,
        };
      }),
    };

    setupConnection([], []);

    service = new BatchMessagingService(
      connection as unknown as TransactionalConnection,
      communicationService as unknown as CommunicationService,
      channelService as unknown as ChannelService,
      channelUserService as unknown as ChannelUserService,
      platformAuditService as unknown as PlatformAuditService,
      jobQueueService as unknown as JobQueueService
    );
  });

  describe('create', () => {
    it('validates input and rejects missing channels', async () => {
      await expect(
        service.create(ctx, {
          name: 'Test',
          content: 'Hello',
          audience: 'ALL_ADMINS',
          channels: { sms: false, whatsapp: false },
        })
      ).rejects.toThrow(UserInputError);
    });

    it('rejects unknown template variables', async () => {
      await expect(
        service.create(ctx, {
          name: 'Test',
          content: 'Hi {{firstNmae}}',
          audience: 'ALL_ADMINS',
          channels: { sms: true, whatsapp: false },
        })
      ).rejects.toThrow('Unknown template variables: firstNmae');
    });

    it('creates a queued campaign and enqueues a job', async () => {
      const admin = createAdmin();
      setupConnection([admin], [admin.user]);
      // Re-bind service after connection change
      service = new BatchMessagingService(
        connection as unknown as TransactionalConnection,
        communicationService as unknown as CommunicationService,
        channelService as unknown as ChannelService,
        channelUserService as unknown as ChannelUserService,
        platformAuditService as unknown as PlatformAuditService,
        jobQueueService as unknown as JobQueueService
      );
      await service.onModuleInit();

      const result = await service.create(ctx, {
        name: 'Launch blast',
        content: 'Hi {{firstName}}',
        audience: 'CUSTOM_USER_IDS',
        customUserIds: ['user-1'],
        channels: { sms: false, whatsapp: true },
      });

      expect(result.status).toBe('QUEUED');
      expect(result.createdByUserId).toBe('super-admin-1');
      expect(result.customUserIds).toEqual(['user-1']);
      expect(queuedJobs).toHaveLength(1);
      expect(queuedJobs[0].data.batchMessageId).toBe(result.id);
      expect(platformAuditService.log).toHaveBeenCalled();
    });

    it('persists customUserIds for CUSTOM_USER_IDS audience', async () => {
      const admin = createAdmin();
      setupConnection([admin], [admin.user]);
      service = new BatchMessagingService(
        connection as unknown as TransactionalConnection,
        communicationService as unknown as CommunicationService,
        channelService as unknown as ChannelService,
        channelUserService as unknown as ChannelUserService,
        platformAuditService as unknown as PlatformAuditService,
        jobQueueService as unknown as JobQueueService
      );
      await service.onModuleInit();

      const result = await service.create(ctx, {
        name: 'Targeted',
        content: 'Hi {{firstName}}',
        audience: 'CUSTOM_USER_IDS',
        customUserIds: ['user-1'],
        channels: { sms: true, whatsapp: false },
      });

      expect(result.customUserIds).toEqual(['user-1']);
    });
  });

  describe('process', () => {
    it('sends rendered WhatsApp messages and updates counts', async () => {
      const admin = createAdmin();
      setupConnection([admin], [admin.user]);
      service = new BatchMessagingService(
        connection as unknown as TransactionalConnection,
        communicationService as unknown as CommunicationService,
        channelService as unknown as ChannelService,
        channelUserService as unknown as ChannelUserService,
        platformAuditService as unknown as PlatformAuditService,
        jobQueueService as unknown as JobQueueService
      );
      await service.onModuleInit();

      const created = await service.create(ctx, {
        name: 'Launch blast',
        content: 'Hi {{firstName}}, welcome to {{shopName}}',
        audience: 'ALL_ADMINS',
        channels: { sms: false, whatsapp: true },
      });

      await service.process(created.id);

      const final = savedBatchMessages.find(m => m.id === created.id);
      expect(final?.status).toBe('SENT');
      expect(final?.sentCount).toBe(1);
      expect(final?.failedCount).toBe(0);
      expect(communicationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'whatsapp',
          recipient: '0712345678',
          body: 'Hi Jane, welcome to DukaRun',
        })
      );
    });

    it('marks campaign FAILED when no recipients resolve', async () => {
      setupConnection([], []);
      service = new BatchMessagingService(
        connection as unknown as TransactionalConnection,
        communicationService as unknown as CommunicationService,
        channelService as unknown as ChannelService,
        channelUserService as unknown as ChannelUserService,
        platformAuditService as unknown as PlatformAuditService,
        jobQueueService as unknown as JobQueueService
      );
      await service.onModuleInit();

      const created = await service.create(ctx, {
        name: 'No recipients',
        content: 'Hi {{firstName}}',
        audience: 'ALL_ADMINS',
        channels: { sms: false, whatsapp: true },
      });

      await service.process(created.id);

      const final = savedBatchMessages.find(m => m.id === created.id);
      expect(final?.status).toBe('FAILED');
      expect(final?.sentCount).toBe(0);
      expect(final?.failedCount).toBe(0);
      expect(communicationService.send).not.toHaveBeenCalled();
    });

    it('falls back to User.identifier when customFields.phoneNumber is missing', async () => {
      const admin = createAdmin({ identifier: '0712345678', customFields: {} });
      setupConnection([admin], [admin.user]);
      service = new BatchMessagingService(
        connection as unknown as TransactionalConnection,
        communicationService as unknown as CommunicationService,
        channelService as unknown as ChannelService,
        channelUserService as unknown as ChannelUserService,
        platformAuditService as unknown as PlatformAuditService,
        jobQueueService as unknown as JobQueueService
      );
      await service.onModuleInit();

      const created = await service.create(ctx, {
        name: 'Identifier fallback',
        content: 'Hi {{firstName}}',
        audience: 'ALL_ADMINS',
        channels: { sms: false, whatsapp: true },
      });

      await service.process(created.id);

      const final = savedBatchMessages.find(m => m.id === created.id);
      expect(final?.status).toBe('SENT');
      expect(final?.sentCount).toBe(1);
      expect(communicationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'whatsapp',
          recipient: '0712345678',
        })
      );
    });
  });
});
