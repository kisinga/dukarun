import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { StatementComponent } from './statement.component';
import { CustomerStatement, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';

const statement: CustomerStatement = {
  store_name: 'Account Shop',
  logo_path: null,
  whatsapp_number: null,
  payment_instructions: null,
  customer_first_name: 'Amina',
  outstanding_total: 0,
  amount_due: 0,
  downpayment_available: 450,
  account_balance: -450,
  expires_at: '2026-09-01T00:00:00Z',
  orders: [],
  activities: [
    {
      id: 'receipt-1',
      date: '2026-08-13T10:00:00Z',
      kind: 'customer_receipt',
      description: 'Payment received',
      reference: 'MPESA-ABC',
      debit: 0,
      credit: 450,
      balance: -450,
      amount: 450,
      direction: 'payment',
    },
  ],
};

describe('StatementComponent', () => {
  it('shows a credit balance and the unified account activity', async () => {
    const storefront = {
      customerStatement: vi.fn().mockResolvedValue(statement),
      companyLogoUrl: vi.fn().mockReturnValue(null),
      legalUrl: vi.fn((path: string) => `https://dukarun.test/${path}`),
    };
    await TestBed.configureTestingModule({
      imports: [StatementComponent],
      providers: [
        { provide: StorefrontService, useValue: storefront },
        { provide: StorefrontSeoService, useValue: { set: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'private-token' } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(StatementComponent);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(storefront.customerStatement).toHaveBeenCalledWith('private-token')
    );
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Downpayment available');
    expect(text).toContain('KES 450');
    expect(text).toContain('Payment received');
    expect(text).toContain('MPESA-ABC');
    expect(text).not.toContain('Open invoices');
  });
});
