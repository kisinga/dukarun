import { Injectable, Logger } from '@nestjs/common';
import { CustomerService, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { LedgerQueryService } from '../financial/ledger-query.service';
/**
 * Builds customer statement data and sends statement via email.
 */
@Injectable()
export class CustomerStatementService {
  private readonly logger = new Logger(CustomerStatementService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly customerService: CustomerService,
    private readonly ledgerQuery: LedgerQueryService,
    private readonly communication: CommunicationService
  ) {}

  async sendStatementEmail(ctx: RequestContext, customerId: string): Promise<boolean> {
    const c = await this.customerService.findOne(ctx, customerId);
    if (!c?.id) return false;
    const email = c.emailAddress?.trim();
    if (!email || email.toLowerCase() === 'walkin@pos.local') return false;

    const { summary, lines } = await this.getStatementData(ctx, customerId);
    const body = this.formatStatementText(summary, lines);
    if (!this.communication) {
      this.logger.warn('CommunicationService not available; statement email not sent');
      return false;
    }
    try {
      const result = await this.communication.send({
        channel: 'email',
        recipient: email,
        body: body as any,
        ctx,
        metadata: { purpose: 'customer_statement' },
      });
      return result.success;
    } catch (e) {
      this.logger.warn(`Statement email failed: ${e}`);
      return false;
    }
  }

  private async getStatementData(
    ctx: RequestContext,
    customerId: string
  ): Promise<{
    summary: { name: string; outstanding: number };
    lines: Array<{
      date: string;
      orderCode: string;
      total: number;
      payments: Array<{ method: string; amount: number; date: string }>;
    }>;
  }> {
    const customer = await this.customerService.findOne(ctx, customerId);
    const name = customer
      ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Customer'
      : 'Customer';

    let outstanding = 0;
    try {
      outstanding = await this.ledgerQuery.getCustomerBalance(Number(ctx.channelId), customerId);
    } catch {
      // ignore
    }

    const orderRepo = this.connection.getRepository(ctx, Order);
    const orders = await orderRepo.find({
      where: { customer: { id: customerId } },
      relations: ['customer', 'payments'],
      order: { orderPlacedAt: 'DESC' as any },
      take: 100,
    });
    const lines = orders.map((o: any) => {
      const payList = (o.payments || [])
        .filter((p: any) => p.state === 'Settled')
        .map((p: any) => ({
          method: p.method ?? 'Payment',
          amount: p.amount ?? 0,
          date: p.createdAt ? new Date(p.createdAt).toISOString() : '',
        }));
      return {
        date: o.orderPlacedAt ?? o.createdAt,
        orderCode: o.code ?? '',
        total: o.totalWithTax ?? o.total ?? 0,
        payments: payList,
      };
    });

    return {
      summary: { name, outstanding },
      lines,
    };
  }

  private formatStatementText(
    summary: { name: string; outstanding: number },
    lines: Array<{
      date: string;
      orderCode: string;
      total: number;
      payments: Array<{ method: string; amount: number; date: string }>;
    }>
  ): string {
    const out = summary.outstanding / 100;
    let s = `Statement for ${summary.name}\n`;
    s += `Outstanding: KES ${out.toFixed(2)}\n\n`;
    for (const l of lines.slice(0, 30)) {
      const d = l.date ? new Date(l.date).toLocaleDateString('en-KE', { dateStyle: 'short' }) : '';
      s += `${d} ${l.orderCode} KES ${(l.total / 100).toFixed(2)}\n`;
      for (const p of l.payments) {
        const pd = p.date
          ? new Date(p.date).toLocaleDateString('en-KE', { dateStyle: 'short' })
          : '';
        s += `  – ${p.method} KES ${(p.amount / 100).toFixed(2)}${pd ? ` (${pd})` : ''}\n`;
      }
    }
    return s;
  }
}
