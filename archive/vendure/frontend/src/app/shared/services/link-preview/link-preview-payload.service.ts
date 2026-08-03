import { inject, Injectable } from '@angular/core';
import { CurrencyService } from '../currency.service';
import type { LinkPreviewData } from './link-preview.types';

/**
 * Builds unified LinkPreviewData from entity shapes for hover previews.
 */
@Injectable({
  providedIn: 'root',
})
export class LinkPreviewPayloadService {
  private readonly currencyService = inject(CurrencyService);

  buildCustomerPayload(customer: any, creditSummary?: any): LinkPreviewData {
    const name = `${customer?.firstName ?? ''} ${customer?.lastName ?? ''}`.trim() || 'Customer';
    const email = customer?.emailAddress?.trim();
    const phone = customer?.phoneNumber?.trim();
    const isWalkIn =
      email?.toLowerCase() === 'walkin@pos.local' ||
      customer?.firstName?.toLowerCase() === 'walk-in';
    let line2: string | null = null;
    if (!isWalkIn) {
      if (email) line2 = email;
      else if (phone) line2 = phone;
    }
    let line3 = '—';
    if (isWalkIn) {
      line3 = 'Walk-in customer';
    } else if (creditSummary) {
      if (creditSummary.isCreditApproved && (creditSummary.creditLimit ?? 0) > 0) {
        line3 = `Credit: ${this.currencyService.format(creditSummary.availableCredit ?? 0, false)} available`;
      } else if ((creditSummary.outstandingAmount ?? 0) !== 0) {
        line3 = `Outstanding: ${this.currencyService.format(Math.abs(creditSummary.outstandingAmount ?? 0), false)}`;
      } else {
        line3 = 'No credit';
      }
    }
    return { line1: name, line2, line3 };
  }

  buildOrderPayload(order: any): LinkPreviewData {
    const code = order?.code ?? '—';
    const state = order?.state ?? '';
    const customer = order?.customer;
    const customerName = customer
      ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Walk-in'
      : 'Walk-in';
    const date = order?.orderPlacedAt || order?.createdAt;
    const dateStr = date
      ? new Date(date).toLocaleDateString('en-KE', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
    const total = order?.totalWithTax ?? order?.total ?? 0;
    return {
      line1: code,
      line2: `${customerName} · ${dateStr}`,
      line3: `Total: ${this.currencyService.format(total, false)}`,
      badge: state || null,
    };
  }

  buildProductPayload(product: any): LinkPreviewData {
    const name = product?.name ?? 'Product';
    const variants = product?.variants ?? [];
    const count = variants.length;
    let line2: string | null = null;
    if (count > 0) {
      const first = variants[0];
      const price = first?.priceWithTax ?? first?.price;
      if (price != null) {
        line2 = this.currencyService.format(price, false);
      } else {
        line2 = `${count} variant${count !== 1 ? 's' : ''}`;
      }
    }
    let line3 = '—';
    if (count === 0) {
      line3 = 'No variants';
    } else {
      const totalStock = variants.reduce((sum: number, v: any) => sum + (v.stockOnHand ?? 0), 0);
      const isService = variants.some((v: any) => v.trackInventory === false);
      line3 = isService
        ? 'Service'
        : `${count} variant${count !== 1 ? 's' : ''} · Stock: ${totalStock}`;
    }
    return { line1: name, line2, line3 };
  }

  buildSupplierPayload(
    supplier: any,
    purchaseInfo?: { total: number; lastRef?: string },
  ): LinkPreviewData {
    const name =
      `${supplier?.firstName ?? ''} ${supplier?.lastName ?? ''}`.trim() ||
      supplier?.emailAddress ||
      'Supplier';
    const email = supplier?.emailAddress?.trim();
    const phone = supplier?.phoneNumber?.trim();
    const line2 = email ? email : (phone ?? null);
    let line3 = '—';
    if (purchaseInfo) {
      const { total, lastRef } = purchaseInfo;
      if (total === 0) {
        line3 = 'No purchases';
      } else {
        line3 = `${total} purchase${total !== 1 ? 's' : ''} · Last: ${lastRef ?? '—'}`;
      }
    }
    return { line1: name, line2, line3 };
  }
}
