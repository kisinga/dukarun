import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { Repository } from 'typeorm';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { OutboundDeliveryService } from '../notifications/outbound-delivery.service';
import { CreditNotificationCheckpoint } from './credit-notification-checkpoint.entity';
import { CreditService } from './credit.service';
import { SupplierCreditAging, SupplierCreditAgingService } from './supplier-credit-aging.service';

export type SupplierApReminderBucket = 'ap_3_days' | 'ap_7_days' | 'ap_10_days' | 'limit_reached';

interface BucketResult {
  bucket: SupplierApReminderBucket;
}

const PERIOD_BUCKETS: { thresholdDays: number; bucket: SupplierApReminderBucket }[] = [
  { thresholdDays: 10, bucket: 'ap_10_days' },
  { thresholdDays: 7, bucket: 'ap_7_days' },
  { thresholdDays: 3, bucket: 'ap_3_days' },
];

const LIMIT_REACHED_THRESHOLD = 0.9; // 90% utilization = effectively reached

/**
 * Daily supplier AP aging scanner.
 *
 * For every supplier with outstanding AP, computes aging and sends exactly one
 * internal reminder per bucket using CreditNotificationCheckpoint for deduplication.
 *
 * - 3/7/10 days overdue: internal admin alerts
 * - Utilization >= 90%: supplier credit limit reached alert
 *
 * No supplier-facing messages are sent. These are internal finance/procurement
 * reminders only.
 */
@Injectable()
export class SupplierCreditNotificationService {
  private readonly logger = new Logger(SupplierCreditNotificationService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly supplierCreditAgingService: SupplierCreditAgingService,
    private readonly creditService: CreditService,
    private readonly outboundDelivery: OutboundDeliveryService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Run the daily supplier AP reminder scan for a channel.
   */
  async runDailyScan(ctx: RequestContext): Promise<{
    suppliersScanned: number;
    notificationsSent: number;
  }> {
    const supplierIds = await this.supplierCreditAgingService.findSuppliersWithOutstanding(ctx);
    let notificationsSent = 0;

    for (const supplierId of supplierIds) {
      try {
        const outstanding = await this.creditService.getBalance(ctx, supplierId, 'supplier');
        if (outstanding <= 0) continue;

        const aging = await this.supplierCreditAgingService.getSupplierAging(
          ctx,
          supplierId,
          outstanding
        );
        if (!aging) continue;

        const selectedBucket = this.selectBucket(aging);
        if (!selectedBucket) continue;
        const { bucket } = selectedBucket;

        const alreadySent = await this.hasCheckpoint(ctx, supplierId, bucket);
        if (alreadySent) continue;

        await this.sendReminder(ctx, aging, bucket);
        await this.createCheckpoint(ctx, supplierId, bucket);
        notificationsSent++;
      } catch (error) {
        this.logger.error(
          `Supplier AP reminder scan failed for supplier ${supplierId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { suppliersScanned: supplierIds.length, notificationsSent };
  }

  private selectBucket(aging: SupplierCreditAging): BucketResult | null {
    // Limit reached takes precedence over period reminders when utilization is high.
    if (aging.utilizationPercent >= LIMIT_REACHED_THRESHOLD) {
      return { bucket: 'limit_reached' };
    }

    for (const { thresholdDays, bucket } of PERIOD_BUCKETS) {
      if (aging.daysOverdue >= thresholdDays) {
        return { bucket };
      }
    }

    return null;
  }

  private async sendReminder(
    ctx: RequestContext,
    aging: SupplierCreditAging,
    bucket: SupplierApReminderBucket
  ): Promise<void> {
    const basePayload = {
      channelId: ctx.channelId?.toString() ?? '',
      supplierId: aging.supplierId,
      supplierName: aging.supplierName,
      outstandingAmount: aging.outstandingAmount,
      creditLimit: aging.creditLimit,
      utilizationPercent: Math.round(aging.utilizationPercent * 100),
      daysOverdue: aging.daysOverdue,
      referenceNumber: aging.oldestPurchase?.referenceNumber,
      dueDate: aging.oldestPurchase?.dueDate.toISOString(),
    };

    const triggerKey = `supplier_${bucket}`;

    await this.outboundDelivery.deliver(ctx, triggerKey, basePayload);

    // Also emit a domain event so other subscribers can react if needed.
    this.eventBus
      .publish(
        new CustomerNotificationEvent(
          ctx,
          basePayload.channelId,
          'supplier_credit_reminder',
          aging.supplierId,
          { bucket, ...basePayload }
        )
      )
      .catch(error => {
        this.logger.warn(
          `Failed to publish supplier_credit_reminder event: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  private async hasCheckpoint(
    ctx: RequestContext,
    supplierId: string,
    bucket: SupplierApReminderBucket
  ): Promise<boolean> {
    const count = await this.checkpointRepo(ctx).count({
      where: {
        customerId: supplierId,
        triggerKey: 'supplier_credit_reminder',
        bucket,
      },
    });
    return count > 0;
  }

  private async createCheckpoint(
    ctx: RequestContext,
    supplierId: string,
    bucket: SupplierApReminderBucket
  ): Promise<void> {
    const checkpoint = new CreditNotificationCheckpoint();
    checkpoint.customerId = supplierId;
    checkpoint.triggerKey = 'supplier_credit_reminder';
    checkpoint.bucket = bucket;
    checkpoint.sentAt = new Date();
    await this.checkpointRepo(ctx).save(checkpoint);
  }

  private checkpointRepo(ctx: RequestContext): Repository<CreditNotificationCheckpoint> {
    return this.connection.getRepository(ctx, CreditNotificationCheckpoint);
  }
}
