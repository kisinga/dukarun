import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Administrator,
  Channel,
  ChannelService,
  JobQueue,
  JobQueueService,
  RequestContext,
  TransactionalConnection,
  User,
  UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { PlatformAuditService } from '../../infrastructure/audit/platform-audit.service';
import { PLATFORM_AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { FINANCIAL_PERMISSIONS, ChannelUserService } from '../auth/channel-user.service';
import { validatePhoneNumber } from '../../utils/phone.utils';
import { BatchMessage } from './batch-message.entity';
import {
  BatchMessageAudience,
  BatchMessageChannels,
  BatchMessageFailureEntry,
  BatchMessageRecipient,
  CreateBatchMessageInput,
} from './batch-message.types';
import { findUnknownTemplateVariables, renderBatchMessage } from './batch-message-template.engine';

const BATCH_MESSAGE_QUEUE_NAME = 'batch-message';
const SMS_MAX_LENGTH = 160;

interface BatchMessageQueueData {
  batchMessageId: string;
}

@Injectable()
export class BatchMessagingService implements OnModuleInit {
  private readonly logger = new Logger(BatchMessagingService.name);
  private batchMessageQueue: JobQueue<BatchMessageQueueData> | undefined;

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly communicationService: CommunicationService,
    private readonly channelService: ChannelService,
    private readonly channelUserService: ChannelUserService,
    private readonly platformAuditService: PlatformAuditService,
    private readonly jobQueueService: JobQueueService
  ) {}

  async onModuleInit(): Promise<void> {
    this.batchMessageQueue = await this.jobQueueService.createQueue<BatchMessageQueueData>({
      name: BATCH_MESSAGE_QUEUE_NAME,
      process: job => this.process(job.data.batchMessageId),
    });
  }

  /**
   * Create a batch message campaign, persist it, and enqueue it for the worker.
   */
  async create(ctx: RequestContext, input: CreateBatchMessageInput): Promise<BatchMessage> {
    this.validateInput(input);

    const recipients = await this.resolveRecipients(ctx, input);
    const batchMessage = new BatchMessage();
    batchMessage.name = input.name.trim();
    batchMessage.content = input.content.trim();
    batchMessage.audience = input.audience;
    batchMessage.channelIds = input.channelIds ?? null;
    batchMessage.customUserIds = input.customUserIds ?? null;
    batchMessage.channels = {
      sms: input.channels.sms === true,
      whatsapp: input.channels.whatsapp === true,
    };
    batchMessage.status = 'QUEUED';
    batchMessage.recipientCount = recipients.length;
    batchMessage.sentCount = 0;
    batchMessage.failedCount = 0;
    batchMessage.failureLog = null;
    batchMessage.createdByUserId = ctx.activeUserId?.toString() ?? null;

    const saved = await this.connection.rawConnection
      .getRepository(BatchMessage)
      .save(batchMessage);

    await this.platformAuditService.log(ctx, PLATFORM_AUDIT_EVENTS.BATCH_MESSAGE_CREATED, {
      entityType: 'BatchMessage',
      entityId: saved.id,
      data: {
        name: saved.name,
        audience: saved.audience,
        channelIds: saved.channelIds,
        channels: saved.channels,
        recipientCount: saved.recipientCount,
      },
    });

    if (!this.batchMessageQueue) {
      throw new Error('Batch message queue is not initialized');
    }
    await this.batchMessageQueue.add({ batchMessageId: saved.id });

    return saved;
  }

  /**
   * List campaigns ordered by newest first.
   */
  async list(options: { skip?: number; take?: number } = {}): Promise<{
    items: BatchMessage[];
    totalItems: number;
  }> {
    const skip = options.skip ?? 0;
    const take = options.take ?? 50;
    const [items, totalItems] = await this.connection.rawConnection
      .getRepository(BatchMessage)
      .findAndCount({
        order: { createdAt: 'DESC' },
        skip,
        take,
      });
    return { items, totalItems };
  }

  /**
   * Find a single campaign.
   */
  async findById(id: string): Promise<BatchMessage | null> {
    return this.connection.rawConnection.getRepository(BatchMessage).findOne({
      where: { id },
    });
  }

  /**
   * Worker-only: deliver the campaign to all resolved recipients.
   */
  async process(batchMessageId: string): Promise<void> {
    const repo = this.connection.rawConnection.getRepository(BatchMessage);
    const batchMessage = await repo.findOne({ where: { id: batchMessageId } });
    if (!batchMessage) {
      this.logger.warn(`BatchMessage ${batchMessageId} not found, skipping`);
      return;
    }

    if (batchMessage.status !== 'QUEUED') {
      this.logger.warn(`BatchMessage ${batchMessageId} is ${batchMessage.status}, skipping`);
      return;
    }

    batchMessage.status = 'SENDING';
    await repo.save(batchMessage);

    const ctx = RequestContext.empty();
    const input = this.toInput(batchMessage);
    const recipients = await this.resolveRecipients(ctx, input);

    let sentCount = 0;
    let failedCount = 0;
    const failureLog: BatchMessageFailureEntry[] = [];

    for (const recipient of recipients) {
      const context = this.buildTemplateContext(recipient);
      const rendered = renderBatchMessage(batchMessage.content, context);

      if (batchMessage.channels.sms) {
        const result = await this.sendToRecipient(recipient, rendered, 'sms');
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          failureLog.push({ userId: recipient.userId, channel: 'sms', error: result.error });
        }
      }

      if (batchMessage.channels.whatsapp) {
        const result = await this.sendToRecipient(recipient, rendered, 'whatsapp');
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          failureLog.push({ userId: recipient.userId, channel: 'whatsapp', error: result.error });
        }
      }
    }

    batchMessage.sentCount = sentCount;
    batchMessage.failedCount = failedCount;
    batchMessage.failureLog = failureLog.length > 0 ? failureLog : null;
    batchMessage.sentAt = new Date();

    if (recipients.length === 0) {
      batchMessage.status = 'FAILED';
    } else if (failedCount === 0) {
      batchMessage.status = 'SENT';
    } else if (sentCount > 0) {
      batchMessage.status = 'PARTIAL';
    } else {
      batchMessage.status = 'FAILED';
    }

    await repo.save(batchMessage);

    await this.platformAuditService.log(ctx, PLATFORM_AUDIT_EVENTS.BATCH_MESSAGE_SENT, {
      entityType: 'BatchMessage',
      entityId: batchMessage.id,
      data: {
        name: batchMessage.name,
        audience: batchMessage.audience,
        recipientCount: recipients.length,
        sentCount,
        failedCount,
      },
    });
  }

  private validateInput(input: CreateBatchMessageInput): void {
    if (!input.name?.trim()) {
      throw new UserInputError('Campaign name is required');
    }
    if (!input.content?.trim()) {
      throw new UserInputError('Message content is required');
    }
    if (!input.channels?.sms && !input.channels?.whatsapp) {
      throw new UserInputError('At least one channel (SMS or WhatsApp) must be selected');
    }
    if (
      input.audience === 'CUSTOM_USER_IDS' &&
      (!input.customUserIds || input.customUserIds.length === 0)
    ) {
      throw new UserInputError('customUserIds are required for CUSTOM_USER_IDS audience');
    }
    const unknown = findUnknownTemplateVariables(input.content);
    if (unknown.length > 0) {
      throw new UserInputError(`Unknown template variables: ${unknown.join(', ')}`);
    }
  }

  private toInput(batchMessage: BatchMessage): CreateBatchMessageInput {
    return {
      name: batchMessage.name,
      content: batchMessage.content,
      audience: batchMessage.audience,
      channelIds: batchMessage.channelIds ?? undefined,
      customUserIds: batchMessage.customUserIds ?? undefined,
      channels: batchMessage.channels,
    };
  }

  private buildTemplateContext(recipient: BatchMessageRecipient) {
    return {
      firstName: recipient.firstName || 'there',
      lastName: recipient.lastName || '',
      shopName: recipient.channelName || recipient.channelCode || BRAND_CONFIG.displayName,
      shopCode: recipient.channelCode || BRAND_CONFIG.lowercase,
    };
  }

  private async sendToRecipient(
    recipient: BatchMessageRecipient,
    rendered: string,
    channel: 'sms' | 'whatsapp'
  ): Promise<{ success: boolean; error: string }> {
    const phone = recipient.phoneNumber;
    if (!phone || !validatePhoneNumber(phone)) {
      return { success: false, error: 'No valid phone number' };
    }

    if (channel === 'sms' && rendered.length > SMS_MAX_LENGTH) {
      return {
        success: false,
        error: `Rendered message exceeds ${SMS_MAX_LENGTH} characters`,
      };
    }

    try {
      const result = await this.communicationService.send({
        channel,
        recipient: phone,
        body: rendered,
        ctx: RequestContext.empty(),
        metadata: { purpose: 'admin_notification', bypassEnabledCheck: true },
      });

      if (result.success) {
        return { success: true, error: '' };
      }
      return { success: false, error: result.error || `${channel} send failed` };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send ${channel} to ${recipient.userId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  private async resolveRecipients(
    ctx: RequestContext,
    input: CreateBatchMessageInput
  ): Promise<BatchMessageRecipient[]> {
    switch (input.audience) {
      case 'ALL_ADMINS':
        return this.resolveAllAdmins();
      case 'SUPER_ADMINS':
        return this.resolveSuperAdmins();
      case 'CHANNEL_ADMINS':
        return this.resolveChannelAdmins(input.channelIds ?? []);
      case 'FINANCIAL_ADMINS':
        return this.resolveFinancialAdmins(input.channelIds ?? []);
      case 'CUSTOM_USER_IDS':
        return this.resolveCustomUserIds(input.customUserIds ?? []);
      default:
        return [];
    }
  }

  private async resolveAllAdmins(): Promise<BatchMessageRecipient[]> {
    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.channels', 'channel')
      .where('admin.deletedAt IS NULL')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    return this.toRecipients(admins, { defaultShopContext: true });
  }

  private async resolveSuperAdmins(): Promise<BatchMessageRecipient[]> {
    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .innerJoinAndSelect('user.roles', 'role')
      .leftJoin('role.channels', 'channel')
      .where('channel.id IS NULL')
      .andWhere('admin.deletedAt IS NULL')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    return this.toRecipients(admins, { defaultShopContext: true });
  }

  private async resolveChannelAdmins(channelIds: string[]): Promise<BatchMessageRecipient[]> {
    if (channelIds.length === 0) {
      const admins = await this.connection.rawConnection
        .getRepository(Administrator)
        .createQueryBuilder('admin')
        .innerJoinAndSelect('admin.user', 'user')
        .innerJoin('user.roles', 'role')
        .innerJoin('role.channels', 'channel')
        .where('admin.deletedAt IS NULL')
        .andWhere('user.deletedAt IS NULL')
        .getMany();
      return this.toRecipients(admins);
    }

    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .innerJoin('user.roles', 'role')
      .innerJoin('role.channels', 'channel')
      .where('channel.id IN (:...channelIds)', { channelIds })
      .andWhere('admin.deletedAt IS NULL')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    return this.toRecipients(admins, { preferredChannelIds: channelIds });
  }

  private async resolveFinancialAdmins(channelIds: string[]): Promise<BatchMessageRecipient[]> {
    const query = this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .innerJoinAndSelect('user.roles', 'role')
      .innerJoin('role.channels', 'channel')
      .where('admin.deletedAt IS NULL')
      .andWhere('user.deletedAt IS NULL');

    if (channelIds.length > 0) {
      query.andWhere('channel.id IN (:...channelIds)', { channelIds });
    }

    const admins = await query.getMany();

    const filtered = admins.filter(admin =>
      admin.user?.roles?.some(role =>
        role.permissions?.some(p => FINANCIAL_PERMISSIONS.includes(p as any))
      )
    );

    return this.toRecipients(filtered, { preferredChannelIds: channelIds });
  }

  private async resolveCustomUserIds(userIds: string[]): Promise<BatchMessageRecipient[]> {
    const users = await this.connection.rawConnection
      .getRepository(User)
      .find({ where: { id: In(userIds) as any } });

    const adminUserIds = users.map(u => u.id.toString());
    const admins = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoinAndSelect('admin.user', 'user')
      .where('admin.deletedAt IS NULL')
      .andWhere('user.id IN (:...adminUserIds)', { adminUserIds })
      .getMany();

    const adminByUserId = new Map(admins.map(a => [a.user?.id.toString(), a]));

    return users
      .map(user => {
        const admin = adminByUserId.get(user.id.toString());
        return this.userToRecipient(user, admin, { defaultShopContext: true });
      })
      .filter((r): r is BatchMessageRecipient => r !== null);
  }

  private toRecipients(
    admins: Administrator[],
    options: { defaultShopContext?: boolean; preferredChannelIds?: string[] } = {}
  ): BatchMessageRecipient[] {
    const seen = new Set<string>();
    const result: BatchMessageRecipient[] = [];

    for (const admin of admins) {
      const user = admin.user;
      if (!user) continue;
      const userId = user.id.toString();
      if (seen.has(userId)) continue;
      seen.add(userId);

      const channelId = this.pickChannelId(user, options.preferredChannelIds);
      const channelInfo = channelId ? this.channelInfoFromUser(user, channelId) : undefined;

      const recipient = this.buildRecipient(admin, user, {
        channelId,
        channelName: channelInfo?.name,
        channelCode: channelInfo?.code,
        defaultShopContext: options.defaultShopContext,
      });
      if (recipient) result.push(recipient);
    }

    return result;
  }

  private buildRecipient(
    admin: Administrator,
    user: User,
    options: {
      channelId?: string;
      channelName?: string;
      channelCode?: string;
      defaultShopContext?: boolean;
    }
  ): BatchMessageRecipient | null {
    const phoneNumber = this.extractPhoneNumber(user);

    if (options.defaultShopContext || !options.channelCode) {
      return {
        userId: user.id.toString(),
        firstName: admin.firstName ?? '',
        lastName: admin.lastName ?? '',
        phoneNumber,
        emailAddress: admin.emailAddress ?? user.identifier ?? '',
        channelId: options.channelId,
        channelName: options.channelName ?? BRAND_CONFIG.displayName,
        channelCode: options.channelCode ?? BRAND_CONFIG.lowercase,
      };
    }

    return {
      userId: user.id.toString(),
      firstName: admin.firstName ?? '',
      lastName: admin.lastName ?? '',
      phoneNumber,
      emailAddress: admin.emailAddress ?? user.identifier ?? '',
      channelId: options.channelId,
      channelName: options.channelName ?? options.channelCode,
      channelCode: options.channelCode,
    };
  }

  private userToRecipient(
    user: User,
    admin: Administrator | undefined,
    options: { defaultShopContext?: boolean } = {}
  ): BatchMessageRecipient | null {
    return {
      userId: user.id.toString(),
      firstName: admin?.firstName ?? '',
      lastName: admin?.lastName ?? '',
      phoneNumber: this.extractPhoneNumber(user),
      emailAddress: admin?.emailAddress ?? user.identifier ?? '',
      channelName: options.defaultShopContext ? BRAND_CONFIG.displayName : undefined,
      channelCode: options.defaultShopContext ? BRAND_CONFIG.lowercase : undefined,
    };
  }

  private extractPhoneNumber(user: User): string | undefined {
    const customPhone = (user.customFields as Record<string, unknown>)?.phoneNumber;
    if (
      typeof customPhone === 'string' &&
      customPhone.trim() &&
      validatePhoneNumber(customPhone.trim())
    ) {
      return customPhone.trim();
    }
    const identifier = user.identifier;
    if (
      typeof identifier === 'string' &&
      identifier.trim() &&
      validatePhoneNumber(identifier.trim())
    ) {
      return identifier.trim();
    }
    return undefined;
  }

  private pickChannelId(user: User, preferredChannelIds?: string[]): string | undefined {
    const roles = (user as any).roles as
      | Array<{ channels?: Array<{ id: string | number }> }>
      | undefined;
    if (!roles) return undefined;

    const channelIds = new Set<string>();
    for (const role of roles) {
      for (const channel of role.channels ?? []) {
        channelIds.add(channel.id.toString());
      }
    }

    if (preferredChannelIds && preferredChannelIds.length > 0) {
      for (const id of preferredChannelIds) {
        if (channelIds.has(id)) return id;
      }
    }

    return Array.from(channelIds)[0];
  }

  private channelInfoFromUser(
    user: User,
    channelId: string
  ): { code: string; name: string } | undefined {
    const roles = (user as any).roles as
      | Array<{ channels?: Array<{ id: string | number; code?: string; name?: string }> }>
      | undefined;
    if (!roles) return undefined;

    for (const role of roles) {
      for (const channel of role.channels ?? []) {
        if (channel.id.toString() === channelId) {
          return { code: channel.code ?? '', name: channel.name ?? channel.code ?? '' };
        }
      }
    }

    return undefined;
  }
}
