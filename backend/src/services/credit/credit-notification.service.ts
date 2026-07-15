import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { Repository } from 'typeorm';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { OutboundDeliveryService } from '../notifications/outbound-delivery.service';
import { CreditNotificationCheckpoint } from './credit-notification-checkpoint.entity';
import { CreditAgingService, CustomerCreditAging } from './credit-aging.service';
import { CreditService } from './credit.service';

export type CreditReminderBucket =
  | 'period_3_days'
  | 'period_7_days'
  | 'period_10_days_frozen'
  | 'limit_reached';

interface BucketResult {
  bucket: CreditReminderBucket;
  shouldFreeze: boolean;
}

const PERIOD_BUCKETS: { thresholdDays: number; bucket: CreditReminderBucket }[] = [
  { thresholdDays: 10, bucket: 'period_10_days_frozen' },
  { thresholdDays: 7, bucket: 'period_7_days' },
  { thresholdDays: 3, bucket: 'period_3_days' },
];

const LIMIT_REACHED_THRESHOLD = 0.9; // 90% utilization = effectively reached
const RECENT_REPAYMENT_SUPPRESS_DAYS = 3; // skip gentle 3-day nudge if paid very recently

/**
 * Daily credit-reminder scanner.
 *
 * For every customer with outstanding AR, computes aging and sends exactly one
 * reminder per bucket using CreditNotificationCheckpoint for deduplication.
 *
 * - 3 days overdue: gentle reminder
 * - 7 days overdue: urgent reminder
 * - 10 days overdue: freeze credit and final notice
 * - Utilization >= 90%: limit reached notice
 *
 * Customer-facing WhatsApp messages are marked systemGenerated so they respect
 * quiet hours. Admin copies are delivered in-app immediately.
 */
@Injectable()
export class CreditNotificationService {
  private readonly logger = new Logger(CreditNotificationService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly creditAgingService: CreditAgingService,
    private readonly creditService: CreditService,
    private readonly outboundDelivery: OutboundDeliveryService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Run the daily credit reminder scan for a channel.
   */
  async runDailyScan(ctx: RequestContext): Promise<{
    customersScanned: number;
    notificationsSent: number;
    customersFrozen: number;
  }> {
    const customerIds = await this.creditAgingService.findCustomersWithOutstanding(ctx);
    let notificationsSent = 0;
    let customersFrozen = 0;

    for (const customerId of customerIds) {
      try {
        const outstanding = await this.creditService.getBalance(ctx, customerId, 'customer');
        if (outstanding <= 0) continue;

        const aging = await this.creditAgingService.getCustomerAging(ctx, customerId, outstanding);
        if (!aging) continue;

        const selectedBucket = this.selectBucket(aging);
        if (!selectedBucket) continue;
        const { bucket, shouldFreeze } = selectedBucket;

        const alreadySent = await this.hasCheckpoint(ctx, customerId, bucket);
        if (alreadySent) continue;

        if (shouldFreeze) {
          await this.freezeCustomer(ctx, customerId);
          customersFrozen++;
        }

        await this.sendReminder(ctx, aging, bucket);
        await this.createCheckpoint(ctx, customerId, bucket);
        notificationsSent++;
      } catch (error) {
        this.logger.error(
          `Credit reminder scan failed for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { customersScanned: customerIds.length, notificationsSent, customersFrozen };
  }

  private selectBucket(aging: CustomerCreditAging): BucketResult | null {
    // Limit reached takes precedence over period reminders when utilization is high.
    if (aging.utilizationPercent >= LIMIT_REACHED_THRESHOLD) {
      return { bucket: 'limit_reached', shouldFreeze: false };
    }

    for (const { thresholdDays, bucket } of PERIOD_BUCKETS) {
      if (aging.daysOverdue >= thresholdDays) {
        // Skip the gentle 3-day nudge if the customer paid very recently.
        if (
          bucket === 'period_3_days' &&
          aging.lastRepaymentDate &&
          this.daysSince(aging.lastRepaymentDate) < RECENT_REPAYMENT_SUPPRESS_DAYS
        ) {
          continue;
        }
        return { bucket, shouldFreeze: bucket === 'period_10_days_frozen' };
      }
    }

    return null;
  }

  private async sendReminder(
    ctx: RequestContext,
    aging: CustomerCreditAging,
    bucket: CreditReminderBucket
  ): Promise<void> {
    const basePayload = {
      channelId: ctx.channelId?.toString() ?? '',
      customerId: aging.customerId,
      customerName: aging.customerName,
      outstandingAmount: aging.outstandingAmount,
      creditLimit: aging.creditLimit,
      utilizationPercent: Math.round(aging.utilizationPercent * 100),
      daysOverdue: aging.daysOverdue,
      orderCode: aging.oldestOrder?.orderCode,
      dueDate: aging.oldestOrder?.dueDate.toISOString(),
      systemGenerated: true,
    };

    const customerTrigger = `credit_${bucket}`;
    const adminTrigger = `credit_${bucket}_admin`;

    await this.outboundDelivery.deliver(ctx, customerTrigger, basePayload);
    await this.outboundDelivery.deliver(ctx, adminTrigger, basePayload);

    // Also emit a domain event so other subscribers can react if needed.
    this.eventBus
      .publish(
        new CustomerNotificationEvent(
          ctx,
          basePayload.channelId,
          'credit_reminder',
          aging.customerId,
          { bucket, ...basePayload }
        )
      )
      .catch(error => {
        this.logger.warn(
          `Failed to publish credit_reminder event: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  private async freezeCustomer(ctx: RequestContext, customerId: string): Promise<void> {
    await this.creditService.freezeCustomerCredit(ctx, customerId, 'customer', '10 days overdue');
  }

  private async hasCheckpoint(
    ctx: RequestContext,
    customerId: string,
    bucket: CreditReminderBucket
  ): Promise<boolean> {
    const count = await this.checkpointRepo(ctx).count({
      where: {
        customerId,
        triggerKey: 'credit_reminder',
        bucket,
      },
    });
    return count > 0;
  }

  private async createCheckpoint(
    ctx: RequestContext,
    customerId: string,
    bucket: CreditReminderBucket
  ): Promise<void> {
    const checkpoint = new CreditNotificationCheckpoint();
    checkpoint.customerId = customerId;
    checkpoint.triggerKey = 'credit_reminder';
    checkpoint.bucket = bucket;
    checkpoint.sentAt = new Date();
    await this.checkpointRepo(ctx).save(checkpoint);
  }

  private checkpointRepo(ctx: RequestContext): Repository<CreditNotificationCheckpoint> {
    return this.connection.getRepository(ctx, CreditNotificationCheckpoint);
  }

  private daysSince(date: Date): number {
    return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  }
}
