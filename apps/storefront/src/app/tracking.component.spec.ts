import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { StorefrontService, type PublicFulfillmentTracking } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';
import { TrackingComponent } from './tracking.component';

const tracking: PublicFulfillmentTracking = {
  merchant_name: 'Dukarun Kitchen',
  merchant_phone: '+254712345678',
  order_code: 'ORD-1024',
  fulfillment_type: 'delivery',
  status: 'in_transit',
  promised_at: '2026-08-25T12:00:00Z',
  updated_at: '2026-08-25T11:30:00Z',
  items: [{ name: 'Pilau', quantity: 2 }],
  milestones: [
    { status: 'pending', at: '2026-08-25T10:00:00Z' },
    { status: 'ready', at: '2026-08-25T11:00:00Z' },
    { status: 'in_transit', at: '2026-08-25T11:30:00Z' },
  ],
};

describe('TrackingComponent', () => {
  it('renders the narrow public projection and marks the route private', async () => {
    const storefront = { fulfillmentTracking: vi.fn().mockResolvedValue(tracking) };
    const seo = { set: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [TrackingComponent],
      providers: [
        { provide: StorefrontService, useValue: storefront },
        { provide: StorefrontSeoService, useValue: seo },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'tracking-token' } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TrackingComponent);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(storefront.fulfillmentTracking).toHaveBeenCalledWith('tracking-token')
    );
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Dukarun Kitchen');
    expect(text).toContain('ORD-1024');
    expect(text).toContain('In Transit');
    expect(text).toContain('2x');
    expect(text).toContain('Pilau');
    expect(text).not.toContain('+254712345678');
    expect(seo.set).toHaveBeenCalledWith(
      'Track order',
      'Private pickup and delivery tracking.',
      '/track',
      true
    );
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer'
    );

    fixture.destroy();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });
});
