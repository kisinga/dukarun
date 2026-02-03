import { Injectable } from '@angular/core';
import { extractCents, extractDisplayName } from '../utils/data-extractors';
import { RecentActivity } from './dashboard.service';

@Injectable({
  providedIn: 'root',
})
export class OrderMapperService {
  /**
   * Transform order to RecentActivity item.
   * Uses shared extractors for amount and customer name.
   */
  toRecentActivity(
    order: any,
    formatAmount: (cents: number) => string,
    getTimeDiff: (date: Date) => string,
  ): RecentActivity {
    const amountCents = extractCents(order.totalWithTax ?? order.total);
    let description = `Order ${order.code}`;
    if (order.customer) {
      const customerName = extractDisplayName(order.customer.firstName, order.customer.lastName);
      if (customerName) {
        description = `Order ${order.code} • ${customerName}`;
      }
    }
    return {
      id: order.id,
      type: 'Sale',
      description,
      amount: formatAmount(amountCents),
      time: getTimeDiff(new Date(order.createdAt)),
    };
  }

  /**
   * Transform array of orders to RecentActivity items.
   */
  toRecentActivities(
    orders: any[],
    formatAmount: (cents: number) => string,
    getTimeDiff: (date: Date) => string,
  ): RecentActivity[] {
    return orders.map((order) => this.toRecentActivity(order, formatAmount, getTimeDiff));
  }
}
