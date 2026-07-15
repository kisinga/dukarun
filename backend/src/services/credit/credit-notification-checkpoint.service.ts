import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { LessThanOrEqual, Repository } from 'typeorm';
import { CreditNotificationCheckpoint } from './credit-notification-checkpoint.entity';

/**
 * Deduplication store for credit/AP reminder scanners.
 *
 * Centralizes checkpoint logic so customer AR and supplier AP scanners share the
 * same expiry/reset behaviour and cannot diverge.
 */
@Injectable()
export class CreditNotificationCheckpointService {
  constructor(private readonly connection: TransactionalConnection) {}

  async hasCheckpoint(
    ctx: RequestContext,
    triggerKey: string,
    partyId: string,
    bucket: string
  ): Promise<boolean> {
    const count = await this.repo(ctx).count({
      where: { customerId: partyId, triggerKey, bucket },
    });
    return count > 0;
  }

  async createCheckpoint(
    ctx: RequestContext,
    triggerKey: string,
    partyId: string,
    bucket: string
  ): Promise<void> {
    const checkpoint = new CreditNotificationCheckpoint();
    checkpoint.customerId = partyId;
    checkpoint.triggerKey = triggerKey;
    checkpoint.bucket = bucket;
    checkpoint.sentAt = new Date();
    await this.repo(ctx).save(checkpoint);
  }

  /**
   * Remove all checkpoints for a party. Called when their balance is fully repaid
   * so reminders can re-arm on future credit.
   */
  async clearCheckpoints(ctx: RequestContext, triggerKey: string, partyId: string): Promise<void> {
    await this.repo(ctx).delete({ customerId: partyId, triggerKey });
  }

  /**
   * Expire old checkpoints so a long-dormant account can be reminded again.
   * Default TTL is 90 days.
   */
  async clearOldCheckpoints(
    ctx: RequestContext,
    triggerKey: string,
    olderThanDays: number = 90
  ): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await this.repo(ctx).delete({
      triggerKey,
      sentAt: LessThanOrEqual(cutoff),
    });
  }

  private repo(ctx: RequestContext): Repository<CreditNotificationCheckpoint> {
    return this.connection.getRepository(ctx, CreditNotificationCheckpoint);
  }
}
