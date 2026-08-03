import { Injectable, Logger } from '@nestjs/common';
import { EventBus, RequestContext } from '@vendure/core';
import { CustomerNotificationEvent } from '../../infrastructure/events/custom-events';
import { OutboundDeliveryService } from '../notifications/outbound-delivery.service';
import { CreditNotificationCheckpointService } from './credit-notification-checkpoint.service';
import { CreditService } from './credit.service';
import { SupplierCreditAging, SupplierCreditAgingService } from './supplier-credit-aging.service';

export type SupplierApReminderBucket =
  | 'ap_3_days'
  | 'ap_7_days'
  | 'ap_10_days'
  | 'limit_warning'
  | 'limit_near';

interface BucketResult {
  bucket: SupplierApReminderBucket;
}

const LIMIT_WARNING_THRESHOLD = 0.8; // 80% utilization: heads-up
const LIMIT_NEAR_THRESHOLD = 0.9; // 90% utilization: effectively at limit
const CHECKPOINT_TTL_DAYS = 90;
const SUPPLIER_TRIGGER_KEY = 'supplier_credit_reminder';

/**
 * Daily supplier AP aging scanner.
 *
 * For every supplier with outstanding AP, computes aging and sends exactly one
 * internal reminder per bucket using CreditNotificationCheckpoint for deduplication.
 *
 * Severity order (most urgent first):
 * - 10 days overdue: urgent internal alert
 * - 7 days overdue: internal alert
 * - 90% utilization: supplier credit limit near
 * - 3 days overdue: internal alert
 * - 80% utilization: supplier credit limit warning
 *
 * No supplier-facing messages are sent. These are internal finance/procurement
 * reminders only.
 */
@Injectable()
export class SupplierCreditNotificationService {
  private readonly logger = new Logger(SupplierCreditNotificationService.name);

  constructor(
    private readonly supplierCreditAgingService: SupplierCreditAgingService,
    private readonly creditService: CreditService,
    private readonly checkpointService: CreditNotificationCheckpointService,
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
    await this.checkpointService.clearOldCheckpoints(
      ctx,
      SUPPLIER_TRIGGER_KEY,
      CHECKPOINT_TTL_DAYS
    );

    const supplierIds = await this.supplierCreditAgingService.findSuppliersWithOutstanding(ctx);
    let notificationsSent = 0;

    for (const supplierId of supplierIds) {
      try {
        const outstanding = await this.creditService.getBalance(ctx, supplierId, 'supplier');
        if (outstanding <= 0) {
          // Balance cleared: re-arm reminders for future credit cycles.
          await this.checkpointService.clearCheckpoints(ctx, SUPPLIER_TRIGGER_KEY, supplierId);
          continue;
        }

        const aging = await this.supplierCreditAgingService.getSupplierAging(
          ctx,
          supplierId,
          outstanding
        );
        if (!aging) continue;

        const selectedBucket = this.selectBucket(aging);
        if (!selectedBucket) continue;
        const { bucket } = selectedBucket;

        const alreadySent = await this.checkpointService.hasCheckpoint(
          ctx,
          SUPPLIER_TRIGGER_KEY,
          supplierId,
          bucket
        );
        if (alreadySent) continue;

        await this.sendReminder(ctx, aging, bucket);
        await this.checkpointService.createCheckpoint(
          ctx,
          SUPPLIER_TRIGGER_KEY,
          supplierId,
          bucket
        );
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
    // 10+ days overdue is the most urgent internal signal.
    if (aging.daysOverdue >= 10) {
      return { bucket: 'ap_10_days' };
    }

    if (aging.daysOverdue >= 7) {
      return { bucket: 'ap_7_days' };
    }

    // 90% utilization: approaching the hard supplier credit limit.
    if (aging.utilizationPercent >= LIMIT_NEAR_THRESHOLD) {
      return { bucket: 'limit_near' };
    }

    if (aging.daysOverdue >= 3) {
      return { bucket: 'ap_3_days' };
    }

    // 80% utilization: early heads-up.
    if (aging.utilizationPercent >= LIMIT_WARNING_THRESHOLD) {
      return { bucket: 'limit_warning' };
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
      systemGenerated: true,
    };

    const triggerKey = `supplier_${bucket}`;

    await this.outboundDelivery.deliver(ctx, triggerKey, basePayload);

    // Also emit a domain event so other subscribers can react if needed.
    this.eventBus
      .publish(
        new CustomerNotificationEvent(
          ctx,
          basePayload.channelId,
          SUPPLIER_TRIGGER_KEY,
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
}
