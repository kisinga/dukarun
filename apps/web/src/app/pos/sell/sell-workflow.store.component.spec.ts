import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../../core/cashier-session.service';
import { LocationContextService } from '../../core/location-context.service';
import { MpesaCheckoutCoordinator } from '../../core/mpesa-checkout-coordinator.service';
import { MpesaService } from '../../core/mpesa.service';
import { PermissionsService } from '../../core/permissions.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { PrintService } from '../../shared/print/print.service';
import { FulfillmentService } from '../../fulfillment/fulfillment.service';
import { LearningPlatformService } from '../../learning/learning-platform.service';
import { CartService } from '../cart.service';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { type CustomerWithCredit, PosRpcError, PosService } from '../pos.service';
import { SellCatalogStore } from './sell-catalog.store';
import { SellWorkflowStore } from './sell-workflow.store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const customer = {
  id: 'customer-1',
  first_name: 'Amina',
  last_name: 'Buyer',
  phone: '0712345678',
  delivery_address: null,
  credit_limit: 10_000,
  ar_balance: 0,
  is_credit_approved: true,
};

const fulfillmentDraft = {
  customer: {
    customer_id: 'customer-1',
    name: 'Amina Buyer',
    phone: '254712345678',
    save_as_customer: false,
    delivery_address: null,
    save_delivery_address: false,
  },
  fulfillment: {
    type: 'pickup',
    collection_kind: 'none',
    recipient_name: 'Amina Buyer',
    phone: '254712345678',
    address: null,
    landmark: null,
    map_link: null,
    preparation_notes: null,
    handoff_notes: null,
    promised_at: null,
    transactional_message_consent: true,
  },
} as const;

describe('SellWorkflowStore', () => {
  const online = signal(true);
  const cartLines = signal([{ variant: { variant_id: 'variant-1' }, quantity: 1 }]);
  const customerId = signal<string | null>(null);
  const draftId = signal<string | null>(null);
  let saleLines = [{ variant_id: 'variant-1', quantity: 1 }];
  let cart: Record<string, unknown>;
  let pos: Record<string, ReturnType<typeof vi.fn>>;
  let sync: Record<string, ReturnType<typeof vi.fn>>;
  let fulfillment: Record<string, ReturnType<typeof vi.fn>>;
  let mpesa: Record<string, unknown>;
  let mpesaCheckout: Record<string, ReturnType<typeof vi.fn>>;
  let learning: { track: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    online.set(true);
    cartLines.set([{ variant: { variant_id: 'variant-1' }, quantity: 1 }]);
    customerId.set(null);
    draftId.set(null);
    saleLines = [{ variant_id: 'variant-1', quantity: 1 }];
    cart = {
      lines: cartLines,
      customerId,
      customerName: signal('Walk-in'),
      draftId,
      total: computed(() => 100 * cartLines().reduce((sum, line) => sum + line.quantity, 0)),
      isEmpty: computed(() => cartLines().length === 0),
      toSaleLines: vi.fn(() => saleLines.map(line => ({ ...line }))),
      clear: vi.fn(() => cartLines.set([])),
      setCustomer: vi.fn((id: string | null) => customerId.set(id)),
      lineLabel: vi.fn(() => 'Tea'),
      removeLine: vi.fn(),
      addVariant: vi.fn().mockReturnValue(true),
      setQuantity: vi.fn(),
      quantityStep: vi.fn().mockReturnValue(1),
      setCustomPrice: vi.fn(),
      lineTotal: vi.fn().mockReturnValue(100),
    };
    pos = {
      postSale: vi.fn().mockResolvedValue({ status: 'completed', orderId: 'order-1' }),
      postSaleWithPrepayment: vi
        .fn()
        .mockResolvedValue({ status: 'completed', orderId: 'order-1' }),
      postCreditSale: vi.fn().mockResolvedValue({ status: 'completed', orderId: 'order-1' }),
      searchCustomers: vi.fn().mockResolvedValue({ items: [], exhaustive: true, hasMore: false }),
      customerDepositAvailable: vi.fn().mockResolvedValue(0),
      customerWithCredit: vi.fn().mockResolvedValue(customer),
      imageUrl: vi.fn(),
    };
    sync = {
      paymentMethods: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    fulfillment = {
      settings: vi.fn().mockResolvedValue(null),
      checkout: vi.fn().mockResolvedValue({
        status: 'completed',
        order_id: 'order-1',
        pin: null,
      }),
      creditCheckout: vi.fn().mockResolvedValue({ status: 'completed', orderId: 'order-1' }),
    };
    mpesa = {
      availability: signal({ active: false, manualFallback: false }),
      refreshAvailability: vi.fn().mockResolvedValue(undefined),
      initiateSale: vi.fn().mockResolvedValue('intent-1'),
    };
    mpesaCheckout = {
      run: vi.fn(async (start: (retry: boolean) => Promise<string>) => {
        await start(false);
        return {
          kind: 'completed',
          intentId: 'intent-1',
          subjectId: 'order-1',
          receipt: 'MPESA1',
        };
      }),
      finalizeCash: vi.fn(),
    };
    learning = { track: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: LearningPlatformService, useValue: learning },
        SellWorkflowStore,
        { provide: CartService, useValue: cart },
        { provide: ConnectivityService, useValue: { online } },
        { provide: SyncService, useValue: sync },
        { provide: PrintService, useValue: { printReceipt: vi.fn() } },
        {
          provide: PermissionsService,
          useValue: {
            has: vi.fn().mockReturnValue(true),
            actionMode: vi.fn().mockReturnValue('allowed'),
          },
        },
        {
          provide: CashierSessionService,
          useValue: {
            assertOpen: vi.fn().mockResolvedValue(undefined),
            canTakePayment: vi.fn().mockReturnValue(true),
            cashierFlowEnabled: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: ReceiptDataService,
          useValue: { printerEnabled: vi.fn().mockResolvedValue(false) },
        },
        { provide: PosService, useValue: pos },
        { provide: SellCatalogStore, useValue: { error: signal(null) } },
        { provide: MpesaService, useValue: mpesa },
        { provide: MpesaCheckoutCoordinator, useValue: mpesaCheckout },
        {
          provide: LocationContextService,
          useValue: { activeId: signal('location-1'), requireActiveId: () => 'location-1' },
        },
        { provide: FulfillmentService, useValue: fulfillment },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reuses cashier handoff identity until the effective cart changes', async () => {
    pos['postSale'].mockRejectedValue(new Error('response lost'));
    const store = TestBed.inject(SellWorkflowStore);

    await store.sendToCashier();
    await store.sendToCashier();
    const firstRef = pos['postSale'].mock.calls[0]?.[4];
    expect(pos['postSale'].mock.calls[1]?.[4]).toBe(firstRef);

    saleLines = [{ variant_id: 'variant-1', quantity: 2 }];
    await store.sendToCashier();
    expect(pos['postSale'].mock.calls[2]?.[4]).not.toBe(firstRef);
  });

  it('keeps a newer customer result when an older search fails later', async () => {
    const older = deferred<never>();
    pos['searchCustomers']
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce({ items: [customer], exhaustive: true, hasMore: false });
    const store = TestBed.inject(SellWorkflowStore);

    const firstSearch = store.onCustomerSearch('am');
    await store.onCustomerSearch('amina');
    older.reject(new Error('old request failed'));
    await firstSearch;

    expect(store.customerResults()).toEqual([customer]);
    expect(store.error()).toBeNull();
  });

  it('queues the immutable sale snapshot while offline', async () => {
    online.set(false);
    const store = TestBed.inject(SellWorkflowStore);

    await store.completeSale([{ method: 'cash', amount: 100 }]);

    expect(sync['enqueue']).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: null, lines: saleLines }),
      expect.any(String)
    );
    expect(cart['clear']).toHaveBeenCalledOnce();
  });

  it('keeps deposit and tender allocation together in mixed settlement', async () => {
    const store = TestBed.inject(SellWorkflowStore);
    store.selectCustomer(customer as CustomerWithCredit);
    const settlement = {
      payments: [{ method: 'cash', amount: 40 }],
      depositAmount: 60,
      creditAmount: 0,
    };

    await store.completeSale(settlement.payments, undefined, settlement);

    expect(pos['postSaleWithPrepayment']).toHaveBeenCalledWith(
      customer.id,
      saleLines,
      settlement,
      expect.any(String),
      undefined
    );
    expect(cart['clear']).toHaveBeenCalledOnce();
  });

  it('retries an expired proforma as a plain sale with the same identity', async () => {
    draftId.set('draft-1');
    pos['postSale']
      .mockRejectedValueOnce(new PosRpcError('draft_not_found: draft-1', 'P0001'))
      .mockResolvedValueOnce({ status: 'completed', orderId: 'order-1' });
    const store = TestBed.inject(SellWorkflowStore);

    await store.completeSale([{ method: 'cash', amount: 100 }]);

    expect(pos['postSale']).toHaveBeenCalledTimes(2);
    expect(pos['postSale'].mock.calls[1]?.[4]).toBe(pos['postSale'].mock.calls[0]?.[4]);
    expect(pos['postSale'].mock.calls[0]?.[6]).toBe('draft-1');
    expect(pos['postSale'].mock.calls[1]?.[6]).toBeUndefined();
    expect(learning.track).toHaveBeenCalledWith('dukarun_cash_sale_completed');
  });

  it('passes the committed fulfillment snapshot to a COD checkout', async () => {
    const store = TestBed.inject(SellWorkflowStore);
    await store.fulfillmentModeChanged('pickup');
    const codDraft = {
      ...fulfillmentDraft,
      fulfillment: { ...fulfillmentDraft.fulfillment, collection_kind: 'cod' as const },
    };

    await store.openCheckout(codDraft);

    expect(fulfillment['checkout']).toHaveBeenCalledWith(
      expect.objectContaining({ customer: codDraft.customer, fulfillment: codDraft.fulfillment })
    );
    expect(cart['clear']).toHaveBeenCalledOnce();
  });

  it('uses the selected customer and fulfillment snapshot for credit checkout', async () => {
    const store = TestBed.inject(SellWorkflowStore);
    store.selectCustomer(customer as CustomerWithCredit);
    await store.fulfillmentModeChanged('pickup');

    await store.openCreditConfirmation(fulfillmentDraft);
    store.confirmCreditSale();

    await vi.waitFor(() => expect(fulfillment['creditCheckout']).toHaveBeenCalledOnce());
    expect(fulfillment['creditCheckout']).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: customer.id,
        customer: fulfillmentDraft.customer,
        fulfillment: fulfillmentDraft.fulfillment,
        clientRef: expect.any(String),
      })
    );
    expect(cart['clear']).toHaveBeenCalledOnce();
    expect(learning.track).toHaveBeenCalledWith('dukarun_credit_sale_completed');
  });

  it('routes integrated M-PESA through the coordinator before clearing the cart', async () => {
    const store = TestBed.inject(SellWorkflowStore);

    await store.completeSale([{ method: 'mpesa', amount: 100, phone: '254712345678' }]);

    expect(mpesaCheckout['run']).toHaveBeenCalledOnce();
    expect(mpesa['initiateSale']).toHaveBeenCalledWith(
      expect.objectContaining({ clientRef: expect.any(String), lines: saleLines })
    );
    expect(cart['clear']).toHaveBeenCalledOnce();
  });

  it('retains a split M-PESA sale until the cash side is confirmed', async () => {
    mpesaCheckout['run'].mockResolvedValueOnce({
      kind: 'awaiting_cash',
      intentId: 'intent-1',
      subjectId: 'order-1',
      cashAmount: 40,
    });
    mpesaCheckout['finalizeCash'].mockResolvedValueOnce('order-1');
    const store = TestBed.inject(SellWorkflowStore);

    await store.completeSale([
      { method: 'mpesa', amount: 60, phone: '254712345678' },
      { method: 'cash', amount: 40 },
    ]);

    expect(store.mpesaSplitReady()).toEqual(
      expect.objectContaining({ intentId: 'intent-1', orderId: 'order-1', cashAmount: 40 })
    );
    expect(cart['clear']).not.toHaveBeenCalled();

    await store.confirmMpesaSplitCash();
    expect(mpesaCheckout['finalizeCash']).toHaveBeenCalledWith('intent-1');
    expect(cart['clear']).toHaveBeenCalledOnce();
  });
});
