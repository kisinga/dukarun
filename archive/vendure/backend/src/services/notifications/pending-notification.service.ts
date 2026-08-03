import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { PendingNotification } from './pending-notification.entity';

export interface CreatePendingNotificationInput {
  channelId: string;
  triggerKey: string;
  recipient: string;
  body: string;
  metadata: Record<string, unknown>;
  scheduledAt: Date;
}

/**
 * Persist and manage WhatsApp messages that were deferred until the next
 * allowed send window.
 */
@Injectable()
export class PendingNotificationService {
  constructor(private readonly connection: TransactionalConnection) {}

  private repo(ctx: RequestContext): Repository<PendingNotification> {
    return this.connection.getRepository(ctx, PendingNotification);
  }

  async create(
    ctx: RequestContext,
    input: CreatePendingNotificationInput
  ): Promise<PendingNotification> {
    const pending = new PendingNotification();
    pending.channelId = input.channelId;
    pending.triggerKey = input.triggerKey;
    pending.recipient = input.recipient;
    pending.body = input.body;
    pending.metadata = input.metadata ?? {};
    pending.scheduledAt = input.scheduledAt;
    pending.attempts = 0;
    pending.sentAt = null;
    pending.error = null;
    return this.repo(ctx).save(pending);
  }

  /**
   * Get pending notifications whose scheduled time has arrived and that have
   * not yet been sent, oldest first.
   */
  async findDue(
    ctx: RequestContext,
    before: Date = new Date(),
    limit: number = 500
  ): Promise<PendingNotification[]> {
    return this.repo(ctx).find({
      where: {
        sentAt: IsNull(),
        scheduledAt: LessThanOrEqual(before),
      },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
  }

  async markSent(ctx: RequestContext, id: string): Promise<void> {
    await this.repo(ctx).update(id, { sentAt: new Date() });
  }

  async markError(ctx: RequestContext, id: string, error: string): Promise<void> {
    await this.repo(ctx).update(id, { error });
  }

  async incrementAttempts(ctx: RequestContext, id: string): Promise<void> {
    await this.repo(ctx).increment({ id }, 'attempts', 1);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.repo(ctx).delete(id);
  }

  async deleteOldSent(ctx: RequestContext, olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const result = await this.repo(ctx).delete({
      sentAt: LessThanOrEqual(cutoff),
    });
    return result.affected || 0;
  }
}
