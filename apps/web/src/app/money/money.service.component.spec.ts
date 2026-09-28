import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../core/supabase.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { ActionExecutorService } from '../core/action-executor.service';
import { BusinessClockService } from '../core/business-clock.service';
import { MoneyService } from './money.service';

describe('MoneyService ledger receivables', () => {
  function setup(data: unknown, error: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data, error });
    const from = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MoneyService,
        { provide: SupabaseService, useValue: { client: { rpc, from } } },
        ...[
          LocationContextService,
          PartyCacheService,
          ActionExecutorService,
          BusinessClockService,
        ].map(provide => ({ provide, useValue: {} })),
      ],
    });
    return { service: TestBed.inject(MoneyService), rpc, from };
  }

  it('uses ledger due verbatim, even when invoice total minus settlements differs', async () => {
    const row = { id: 'order-1', total: 10000, paid: 10000, outstanding: 9700 };
    const { service, rpc, from } = setup([row]);
    await expect(service.creditOrders('customer-1')).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('customer_receivable_documents', {
      p_customer_id: 'customer-1',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not reconstruct invoices after an empty ledger result', async () => {
    const { service, from } = setup([]);
    await expect(service.creditOrders('customer-1')).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates failures instead of falling back to a second balance calculation', async () => {
    const error = new Error('permission denied');
    const { service } = setup(null, error);
    await expect(service.creditOrders('customer-1')).rejects.toBe(error);
  });

  it('loads zero and positive ledger balances together without recalculating them', async () => {
    const rows = [
      { order_id: 'written-off', outstanding: 0, settled_amount: 600 },
      { order_id: 'corrected', outstanding: 500, settled_amount: 1000 },
    ];
    const { service, rpc } = setup(rows);
    await expect(service.orderReceivableStatuses(['written-off', 'corrected'])).resolves.toEqual(
      rows
    );
    expect(rpc).toHaveBeenCalledWith('order_receivable_statuses', {
      p_order_ids: ['written-off', 'corrected'],
    });
  });

  it('does not request an empty order page', async () => {
    const { service, rpc } = setup([]);
    await expect(service.orderReceivableStatuses([])).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [] },
    { rows: [{ order_id: 'wrong-order', outstanding: 0, settled_amount: 0 }] },
  ])(
    'rejects incomplete or mismatched balances instead of treating them as settled',
    async ({ rows }) => {
      const { service } = setup(rows);
      await expect(service.orderReceivableStatuses(['requested-order'])).rejects.toThrow(
        'Could not read every order balance'
      );
    }
  );

  it('propagates a failed balance read', async () => {
    const error = new Error('permission denied');
    const { service } = setup(null, error);
    await expect(service.orderReceivableStatuses(['order-1'])).rejects.toBe(error);
  });
});
