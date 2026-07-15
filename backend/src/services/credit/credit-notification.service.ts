import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { OutboundDeliveryService } from '../notifications/outbound-delivery.service';
import { CreditAgingService, CustomerCreditAging } from './credit-aging.service';
import { CreditNotificationCheckpointService } from './credit-notification-checkpoint.service';
import { CreditService } from './credit.service';

export type CreditReminderBucket =
  | 'period_3_days'
  | 'period_7_days'
  | 'period_10_days_frozen'
  | 'limit_warning'
  | 'limit_near';

interface BucketResult {
  bucket: CreditReminderBucket;
  shouldFreeze: boolean;
}

const LIMIT_WARNING_THRESHOLD = 0.8; // 80% utilization: heads-up
const LIMIT_NEAR_THRESHOLD = 0.9; // 90% utilization: effectively at limit
const RECENT_REPAYMENT_SUPPRESS_DAYS = 3; // skip gentle 3-day nudge if paid very recently
const CHECKPOINT_TTL_DAYS = 90;
const CUSTOMER_TRIGGER_KEY = 'credit_reminder';

/**
 * Daily credit-reminder scanner.
 *
 * For every customer with outstanding AR, computes aging and sends exactly one
 * reminder per bucket using CreditNotificationCheckpoint for deduplication.
 *
 * Severity order (most urgent first):
 * - 10 days overdue: freeze credit and final notice
 * - 7 days overdue: urgent reminder
 * - 90% utilization: limit near notice
 * - 3 days overdue: gentle reminder (suppressed if repaid very recently)
 * - 80% utilization: limit warning notice
 *
 * Customer-facing WhatsApp messages are deferred outside quiet hours.
 * Admin copies are delivered in-app immediately.
 */
@Injectable()
export class CreditNotificationService {
  private readonly logger = new Logger(CreditNotificationService.name);

  constructor(
    private readonly creditAgingService: CreditAgingService,
    private readonly creditService: CreditService,
    private readonly checkpointService: CreditNotificationCheckpointService,
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
    await this.checkpointService.clearOldCheckpoints(
      ctx,
      CUSTOMER_TRIGGER_KEY,
      CHECKPOINT_TTL_DAYS
    );

    const customerIds = await this.creditAgingService.findCustomersWithOutstanding(ctx);
    let notificationsSent = 0;
    let customersFrozen = 0;

    for (const customerId of customerIds) {
      try {
        const outstanding = await this.creditService.getBalance(ctx, customerId, 'customer');
        if (outstanding <= 0) {
          // Balance cleared: re-arm reminders for future credit cycles.
          await this.checkpointService.clearCheckpoints(ctx, CUSTOMER_TRIGGER_KEY, customerId);
          continue;
        }

        const aging = await this.creditAgingService.getCustomerAging(ctx, customerId, outstanding);
        if (!aging) continue;

        const selectedBucket = this.selectBucket(aging);
        if (!selectedBucket) continue;
        const { bucket, shouldFreeze } = selectedBucket;

        const alreadySent = await this.checkpointService.hasCheckpoint(
          ctx,
          CUSTOMER_TRIGGER_KEY,
          customerId,
          bucket
        );
        if (alreadySent) continue;

        if (shouldFreeze) {
          await this.freezeCustomer(ctx, customerId);
          customersFrozen++;
        }

        await this.sendReminder(ctx, aging, bucket);
        await this.checkpointService.createCheckpoint(
          ctx,
          CUSTOMER_TRIGGER_KEY,
          customerId,
          bucket
        );
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
    // 10+ days overdue always freezes, even if utilization is also high.
    if (aging.daysOverdue >= 10) {
      return { bucket: 'period_10_days_frozen', shouldFreeze: true };
    }

    // 7 days overdue is more urgent than a limit warning.
    if (aging.daysOverdue >= 7) {
      return { bucket: 'period_7_days', shouldFreeze: false };
    }

    // 90% utilization: approaching the hard limit.
    if (aging.utilizationPercent >= LIMIT_NEAR_THRESHOLD) {
      return { bucket: 'limit_near', shouldFreeze: false };
    }

    // Gentle 3-day nudge (skip if the customer paid very recently).
    if (aging.daysOverdue >= 3) {
      if (
        aging.lastRepaymentDate &&
        this.daysSince(aging.lastRepaymentDate) < RECENT_REPAYMENT_SUPPRESS_DAYS
      ) {
        // fall through to limit_warning if utilization is high enough
      } else {
        return { bucket: 'period_3_days', shouldFreeze: false };
      }
    }

    // 80% utilization: early heads-up.
    if (aging.utilizationPercent >= LIMIT_WARNING_THRESHOLD) {
      return { bucket: 'limit_warning', shouldFreeze: false };
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
          CUSTOMER_TRIGGER_KEY,
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

  private daysSince(date: Date): number {
    return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  }
}
