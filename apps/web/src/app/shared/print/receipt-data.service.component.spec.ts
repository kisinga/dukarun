import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/supabase.service';
import { CatalogIdentityLookupService } from '../../core/identity-lookup.services';
import { PosService } from '../../pos/pos.service';
import { ProfileService } from '../../profile/profile.service';
import { ReceiptDataService } from './receipt-data.service';
import { orderDocumentContent } from './document-adapters';

describe('ReceiptDataService staff attribution', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    { currentVat: false, hadVat: true },
    { currentVat: true, hadVat: false },
  ])(
    'uses finalized VAT and staff identity when current VAT is $currentVat and sale VAT was $hadVat',
    async ({ currentVat, hadVat }) => {
      const taxDocumentQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: hadVat
            ? { document_number: 'VAT-001', issuer_tax_registration_number: 'ORIGINAL-PIN' }
            : null,
          error: null,
        }),
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
      const rpc = vi.fn().mockResolvedValue({ data: { paid: 100, balance: 0 }, error: null });

      TestBed.configureTestingModule({
        providers: [
          ReceiptDataService,
          {
            provide: SupabaseService,
            useValue: {
              client: {
                from: vi.fn(() => taxDocumentQuery),
                rpc,
              },
            },
          },
          { provide: PosService, useValue: pos },
          {
            provide: CatalogIdentityLookupService,
            useValue: { resolve: vi.fn().mockResolvedValue({ items: new Map() }) },
          },
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
        vatRegistered: currentVat,
        taxRegistrationNumber: 'CURRENT-PIN',
      });

      const { meta } = await service.buildReceiptData('order-1');

      expect(meta.servedBy).toBe('Amina');
      expect(meta.vatRegistered).toBe(hadVat);
      expect(meta.taxRegistrationNumber).toBe(hadVat ? 'ORIGINAL-PIN' : null);

      pos.getOrder.mockResolvedValue({ ...(await pos.getOrder()), is_credit_sale: true });
      rpc.mockResolvedValue({
        data: { document_type: 'invoice', paid: 60, balance: 40 },
        error: null,
      });
      const invoice = await service.buildSaleDocumentData('order-1');
      expect(invoice.meta.documentType).toBe('invoice');
      expect(invoice.order.openBalance).toBe(40);
      expect(invoice.order.paidAmount).toBe(60);
      expect(
        orderDocumentContent(invoice.order, { name: 'Shop' }, invoice.meta).metadata
      ).toContainEqual({ label: 'Status', value: 'Partially paid' });
      await expect(service.buildReceiptData('order-1')).rejects.toThrow('open balance');

      rpc.mockResolvedValue({
        data: { document_type: 'invoice', paid: 0, balance: 100 },
        error: null,
      });
      const unpaid = await service.buildSaleDocumentData('order-1');
      expect(
        orderDocumentContent(unpaid.order, { name: 'Shop' }, unpaid.meta).metadata
      ).toContainEqual({ label: 'Status', value: 'Unpaid' });
    }
  );
});
