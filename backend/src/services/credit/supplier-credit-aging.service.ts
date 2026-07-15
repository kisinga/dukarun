import { Injectable } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection } from '@vendure/core';
import { In, Repository } from 'typeorm';
import { diffCalendarDays } from '../../utils/date.utils';
import { StockPurchase } from '../stock/entities/purchase.entity';

export interface AgedPurchase {
  purchaseId: string;
  referenceNumber: string | null;
  purchaseTotal: number;
  amountOwing: number;
  purchaseDate: Date;
  dueDate: Date;
  daysOverdue: number;
}

export interface SupplierCreditAging {
  supplierId: string;
  supplierName: string;
  outstandingAmount: number;
  creditLimit: number;
  creditDurationDays: number;
  availableCredit: number;
  utilizationPercent: number;
  oldestPurchase: AgedPurchase | null;
  daysOverdue: number;
  lastRepaymentDate: Date | null;
}

/**
 * Computes purchase-based AP aging for suppliers.
 *
 * - Due date = purchase.createdAt + supplier supplierCreditDuration.
 * - Days overdue = floor(now - dueDate) for the oldest unpaid credit purchase.
 * - Utilization = outstanding / creditLimit (0 if no limit).
 */
@Injectable()
export class SupplierCreditAgingService {
  constructor(private readonly connection: TransactionalConnection) {}

  async getSupplierAging(
    ctx: RequestContext,
    supplierId: string,
    outstandingAmount: number
  ): Promise<SupplierCreditAging | null> {
    const supplier = await this.supplierRepo(ctx).findOne({
      where: { id: supplierId },
      relations: ['user'],
    });
    if (!supplier) return null;

    const cf = (supplier.customFields || {}) as Record<string, unknown>;
    const creditLimit = Number(cf.supplierCreditLimit ?? 0);
    const creditDurationDays = Number(cf.supplierCreditDuration ?? 30);
    const availableCredit = Math.max(0, creditLimit - outstandingAmount);
    const utilizationPercent = creditLimit > 0 ? outstandingAmount / creditLimit : 0;

    const oldestPurchase = await this.getOldestUnpaidPurchase(ctx, supplierId, creditDurationDays);

    return {
      supplierId,
      supplierName: this.supplierName(supplier),
      outstandingAmount,
      creditLimit,
      creditDurationDays,
      availableCredit,
      utilizationPercent,
      oldestPurchase,
      daysOverdue: oldestPurchase?.daysOverdue ?? 0,
      lastRepaymentDate: cf.supplierLastRepaymentDate
        ? new Date(String(cf.supplierLastRepaymentDate))
        : null,
    };
  }

  /**
   * All suppliers in the channel with any outstanding balance on credit purchases.
   */
  async findSuppliersWithOutstanding(ctx: RequestContext): Promise<string[]> {
    const rows = (await this.purchaseRepo(ctx)
      .createQueryBuilder('purchase')
      .select('DISTINCT purchase.supplierId', 'supplierId')
      .where('purchase.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('purchase.isCreditPurchase = :isCreditPurchase', { isCreditPurchase: true })
      .andWhere('purchase.paymentStatus IN (:...statuses)', { statuses: ['pending', 'partial'] })
      .getRawMany()) as Array<{ supplierId: string | number }>;

    return rows.map(r => String(r.supplierId));
  }

  private async getOldestUnpaidPurchase(
    ctx: RequestContext,
    supplierId: string,
    creditDurationDays: number
  ): Promise<AgedPurchase | null> {
    const now = new Date();
    const purchases = await this.purchaseRepo(ctx).find({
      where: {
        supplierId: Number(supplierId),
        channelId: ctx.channelId as number,
        isCreditPurchase: true,
        paymentStatus: In(['pending', 'partial']),
      },
      relations: ['payments'],
      order: { createdAt: 'ASC' },
    });

    let oldest: AgedPurchase | null = null;

    for (const purchase of purchases) {
      const totalOwed = purchase.totalCost || 0;
      const paid = (purchase.payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );
      const amountOwing = Math.max(0, totalOwed - paid);
      if (amountOwing <= 0) continue;

      const purchaseDate = purchase.createdAt;
      if (!purchaseDate) continue;

      const dueDate = this.addDays(new Date(purchaseDate), creditDurationDays);
      const daysOverdue = Math.max(0, diffCalendarDays(now, dueDate));

      if (!oldest || dueDate.getTime() < oldest.dueDate.getTime()) {
        oldest = {
          purchaseId: purchase.id,
          referenceNumber: purchase.referenceNumber,
          purchaseTotal: totalOwed,
          amountOwing,
          purchaseDate: new Date(purchaseDate),
          dueDate,
          daysOverdue,
        };
      }
    }

    return oldest;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private supplierName(supplier: Customer): string {
    const firstName = supplier.firstName ?? '';
    const lastName = supplier.lastName ?? '';
    const full = `${firstName} ${lastName}`.trim();
    return full || supplier.emailAddress || `Supplier ${supplier.id}`;
  }

  private supplierRepo(ctx: RequestContext): Repository<Customer> {
    return this.connection.getRepository(ctx, Customer);
  }

  private purchaseRepo(ctx: RequestContext): Repository<StockPurchase> {
    return this.connection.getRepository(ctx, StockPurchase);
  }
}
