import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/supabase.service';
import { PosService } from '../../pos/pos.service';
import { ProfileService } from '../../profile/profile.service';
import {
  A4Template,
  type OrderData,
  Receipt52mmTemplate,
  Receipt80mmTemplate,
} from './print-templates';
import { ReceiptDataService } from './receipt-data.service';

const printedOrder: OrderData = {
  id: 'order-1',
  code: 'SALE-001',
  state: 'Fulfilled',
  createdAt: '2026-08-28T08:00:00.000Z',
  updatedAt: '2026-08-28T08:00:00.000Z',
  total: 100,
  totalWithTax: 100,
  currencyCode: 'KES',
  customer: null,
  lines: [],
  payments: [
    {
      id: 'payment-1',
      state: 'Settled',
      amount: 100,
      method: 'cash',
      createdAt: '2026-08-28T08:00:00.000Z',
    },
  ],
};

describe('ReceiptDataService staff attribution', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('uses the logged-in staff profile first name on receipts', async () => {
    const taxDocumentQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const pos = {
      getOrder: vi.fn().mockResolvedValue({
        id: 'order-1',
        code: 'SALE-001',
        status: 'completed',
        created_at: '2026-08-28T08:00:00.000Z',
        updated_at: '2026-08-28T08:00:00.000Z',
        expires_at: null,
        total: 100,
        net_total: 100,
        tax_total: 0,
        tax_snapshot_status: 'final',
        customers: null,
        customer_id: null,
        is_credit_sale: false,
      }),
      orderLines: vi.fn().mockResolvedValue([]),
      orderPayments: vi.fn().mockResolvedValue([]),
      variantsByIds: vi.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        ReceiptDataService,
        { provide: SupabaseService, useValue: { client: { from: vi.fn(() => taxDocumentQuery) } } },
        { provide: PosService, useValue: pos },
        {
          provide: ProfileService,
          useValue: {
            me: vi.fn().mockReturnValue(null),
            myProfile: vi.fn().mockResolvedValue({ display_name: 'Amina Wanjiru' }),
          },
        },
      ],
    });
    const service = TestBed.inject(ReceiptDataService);
    vi.spyOn(service, 'companyPrintInfo').mockResolvedValue({
      name: 'Duka',
      code: 'DUKA',
      logoUrl: null,
      address: null,
      printerEnabled: true,
      showVatBreakdown: false,
      vatRegistered: false,
      taxRegistrationNumber: null,
    });

    const { meta } = await service.buildReceiptData('order-1');

    expect(meta.servedBy).toBe('Amina');
  });
});

describe('receipt templates', () => {
  it.each([new Receipt52mmTemplate(), new Receipt80mmTemplate(), new A4Template()])(
    'prints the served-by sentence on $name',
    template => {
      const html = template.render(printedOrder, null, 'Duka', {
        documentType: 'receipt',
        paymentMethodName: 'Cash',
        servedBy: 'Amina',
      });

      expect(html).toContain('You were served by Amina.');
    }
  );
});
