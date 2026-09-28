import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalsService } from '../approvals/approvals.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { MoneyService } from '../money/money.service';
import { PosService, type OrderWithCustomer } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { OrdersComponent } from './orders.component';

const order = {
  id: 'order-1',
  code: 'SO-1',
  status: 'completed',
  is_credit_sale: true,
  total: 1000,
  created_at: '2026-09-28T08:00:00Z',
  customers: null,
} as OrderWithCustomer;
async function setup(due?: number, paid = 1000) {
  await TestBed.configureTestingModule({
    imports: [OrdersComponent],
    providers: [
      provideRouter([]),
      { provide: PermissionsService, useValue: { has: () => true, actionMode: () => 'blocked' } },
      {
        provide: PosService,
        useValue: {
          expireProformas: async () => undefined,
          ordersPage: async () => ({ rows: [order], count: 1 }),
        },
      },
      { provide: ReceiptDataService, useValue: { printerEnabled: async () => false } },
      { provide: PrintService, useValue: {} },
      {
        provide: MoneyService,
        useValue: {
          orderReceivableStatuses: async () =>
            due === undefined
              ? []
              : [{ order_id: order.id, outstanding: due, settled_amount: paid }],
        },
      },
      { provide: FulfillmentService, useValue: { orderSummaries: async () => [] } },
      { provide: ApprovalsService, useValue: { revision: signal(0), forOrders: async () => [] } },
      {
        provide: RecentSalesCacheService,
        useValue: { revision: signal(0), loaded: signal(false), ensureLoaded: async () => true },
      },
      {
        provide: PartyCacheService,
        useValue: { customers: signal([]), ensureLoaded: async () => true },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(OrdersComponent);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance['orders']()).toHaveLength(1));
  await fixture.whenStable();
  fixture.detectChanges();
  expect(fixture.componentInstance['error']()).toBeNull();
  return { component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('Orders ledger balances', () => {
  it('treats a ledger-cleared invoice as settled without claiming full payment', async () => {
    const { component, root } = await setup(0, 600);
    expect(root.textContent).toContain('credit · settled');
    expect(component['creditBadge'](order).type).toBe('success');
    expect(component['noPaymentsMessage'](order)).toBe('Credit sale — no outstanding balance.');
    expect(component['canSendReceipt'](order)).toBe(true);
  });

  it('keeps a corrected debt outstanding even when payments equal the invoice total', async () => {
    const { component, root } = await setup(500);
    expect(root.textContent).toContain('credit · outstanding');
    expect(component['creditBadge'](order).type).toBe('warning');
    expect(component['noPaymentsMessage'](order)).toContain('still outstanding');
    expect(component['canSendReceipt'](order)).toBe(false);
  });

  it('does not turn missing balance data into a settled invoice or receipt', async () => {
    const { component, root } = await setup();
    expect(root.textContent).toContain('credit · balance unavailable');
    expect(component['creditBadge'](order).type).toBe('neutral');
    expect(component['noPaymentsMessage'](order)).toContain('balance unavailable');
    expect(component['canSendReceipt'](order)).toBe(false);
    component['orderDues'].set(new Map([[order.id, 0]]));
    expect(component['canSendReceipt']({ ...order, status: 'pending_payment' })).toBe(false);
  });
});
