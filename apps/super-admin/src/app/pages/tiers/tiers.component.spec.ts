import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import { heroArchiveBox, heroChevronRight, heroPlus, heroXMark } from '@ng-icons/heroicons/outline';
import { describe, expect, it, vi } from 'vitest';
import { PlatformService, Tier } from '../../core/platform.service';
import { TiersComponent } from './tiers.component';

const standardTier = {
  id: 'tier-standard',
  code: 'standard',
  name: 'Standard',
  price_monthly: 2_000,
  price_yearly: 20_000,
  is_active: true,
  max_team_members: null,
  max_products: 10_000,
  max_stock_locations: null,
  max_orders_per_month: null,
  sms_per_period: 100,
  whatsapp_per_period: 100,
  multiple_locations_enabled: true,
  fulfillment_available: true,
  staff_performance_enabled: true,
  commissions_available: true,
  storefront_available: true,
  payment_reminders_available: true,
} as Tier;

describe('TiersComponent', () => {
  it('loads and saves the pickup and delivery capability with the tier', async () => {
    const platform = {
      tiers: vi.fn().mockResolvedValue([standardTier]),
      billingConfig: vi.fn().mockResolvedValue({
        newCustomerTierCode: 'standard',
        newCustomerTierName: 'Standard',
        initialPurchasePrice: 2_000,
        testingAccessMonths: 2,
      }),
      upsertTier: vi.fn().mockResolvedValue('tier-standard'),
      updateBillingPolicy: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [TiersComponent],
      providers: [
        { provide: PlatformService, useValue: platform },
        provideIcons({ heroArchiveBox, heroChevronRight, heroPlus, heroXMark }),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TiersComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Pickup & delivery');
    root.querySelector<HTMLElement>('tr[role="button"]')!.click();
    fixture.detectChanges();

    const capabilitiesTab = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
    ).find(button => button.textContent?.includes('Capabilities'))!;
    capabilitiesTab.click();
    fixture.detectChanges();

    const fulfillmentRow = Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find(
      label => label.textContent?.includes('Pickup & delivery')
    )!;
    const fulfillmentCheckbox = fulfillmentRow.querySelector<HTMLInputElement>('input')!;
    expect(fulfillmentCheckbox.checked).toBe(true);
    fulfillmentCheckbox.click();
    fixture.detectChanges();

    const saveButton = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button[type="submit"]')
    ).find(button => button.textContent?.includes('Save changes'))!;
    saveButton.click();
    await fixture.whenStable();

    expect(platform.upsertTier).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillment_available: false })
    );
  });
});
