import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { StatementComponent } from './statement.component';
import { CustomerStatement, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';

const firstPage = {
  store_name: 'Account Shop',
  logo_path: null,
  whatsapp_number: null,
  payment_instructions: null,
  customer_first_name: 'Amina',
  outstanding_total: 300,
  amount_due: 300,
  downpayment_available: 0,
  account_balance: 300,
  expires_at: '2026-08-20T00:00:00Z',
  orders: [],
  activities: [
    {
      id: 'newest',
      date: '2026-08-13T10:00:00Z',
      kind: 'credit_sale',
      description: 'Credit sale',
      reference: 'SALE-2',
      debit: 200,
      credit: 0,
      balance: 300,
      amount: 200,
      direction: 'charge',
    },
  ],
  activity_has_more: true,
} as CustomerStatement;

describe('StatementComponent pagination', () => {
  it('appends older account activity with the last row as its cursor', async () => {
    const olderPage: CustomerStatement = {
      ...firstPage,
      activities: [
        {
          id: 'older',
          date: '2026-08-12T10:00:00Z',
          kind: 'credit_sale',
          description: 'Opening credit sale',
          reference: 'SALE-1',
          debit: 100,
          credit: 0,
          balance: 100,
          amount: 100,
          direction: 'charge',
        },
      ],
      activity_has_more: false,
    };
    const storefront = {
      customerStatement: vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(olderPage),
      companyLogoUrl: vi.fn().mockReturnValue(null),
      legalUrl: vi.fn((path: string) => `https://dukarun.test/${path}`),
    };
    await TestBed.configureTestingModule({
      imports: [StatementComponent],
      providers: [
        { provide: StorefrontService, useValue: storefront },
        { provide: StorefrontSeoService, useValue: { set: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'token' } } } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(StatementComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(storefront.customerStatement).toHaveBeenCalledTimes(1));
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(element =>
      element.textContent.includes('Load older activity')
    ) as HTMLButtonElement;
    button.click();
    await vi.waitFor(() => expect(storefront.customerStatement).toHaveBeenCalledTimes(2));
    fixture.detectChanges();

    expect(storefront.customerStatement).toHaveBeenLastCalledWith('token', {
      date: '2026-08-13T10:00:00Z',
      id: 'newest',
    });
    expect(fixture.nativeElement.textContent).toContain('Opening credit sale');
    expect(fixture.nativeElement.textContent).not.toContain('Load older activity');
  });
});
