import { Injectable } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection } from '@vendure/core';
import { Repository } from 'typeorm';
import { addDays, diffCalendarDays } from '../../utils/date.utils';
import { FinancialService } from '../financial/financial.service';
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
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly financialService: FinancialService
  ) {}

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
      .select(['purchase.id AS id', 'purchase.supplierId AS supplierId'])
      .where('purchase.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('purchase.isCreditPurchase = :isCreditPurchase', { isCreditPurchase: true })
      .getRawMany()) as Array<{ id: string; supplierId: string | number }>;

    const statuses = await this.financialService.getPurchasePaymentStatuses(
      ctx,
      rows.map(r => r.id)
    );

    const owingSuppliers = new Set<string>();
    for (const row of rows) {
      const amountOwing = statuses.get(row.id)?.amountOwing ?? 0;
      if (amountOwing <= 0) continue;
      owingSuppliers.add(String(row.supplierId));
    }

    return Array.from(owingSuppliers);
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
      },
      order: { createdAt: 'ASC' },
    });

    const statuses = await this.financialService.getPurchasePaymentStatuses(
      ctx,
      purchases.map(p => p.id)
    );

    let oldest: AgedPurchase | null = null;

    for (const purchase of purchases) {
      const status = statuses.get(purchase.id);
      const amountOwing = status?.amountOwing ?? 0;
      if (amountOwing <= 0) continue;

      const purchaseDate = purchase.createdAt;
      if (!purchaseDate) continue;

      const dueDate = addDays(new Date(purchaseDate), creditDurationDays);
      const daysOverdue = Math.max(0, diffCalendarDays(now, dueDate));

      if (!oldest || dueDate.getTime() < oldest.dueDate.getTime()) {
        oldest = {
          purchaseId: purchase.id,
          referenceNumber: purchase.referenceNumber,
          purchaseTotal: status?.totalOwed ?? purchase.totalCost ?? 0,
          amountOwing,
          purchaseDate: new Date(purchaseDate),
          dueDate,
          daysOverdue,
        };
      }
    }

    return oldest;
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
