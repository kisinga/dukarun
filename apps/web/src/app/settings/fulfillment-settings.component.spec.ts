import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { LocationContextService } from '../core/location-context.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { FulfillmentService, type FulfillmentSettings } from '../fulfillment/fulfillment.service';
import { FulfillmentSettingsComponent } from './fulfillment-settings.component';

const settings: FulfillmentSettings = {
  company_id: 'company-1',
  location_id: 'location-1',
  enabled: true,
  feature_available: true,
  pickup_enabled: true,
  delivery_enabled: true,
  cod_enabled: false,
  default_delivery_fee_variant_id: 'fee-1',
  pickup_sla_minutes: 30,
  delivery_sla_minutes: 60,
  notification_channel: 'whatsapp',
  sms_fallback: true,
  notify_initial: true,
  notify_ready: true,
  notify_in_transit: true,
  notify_failed: true,
  notify_fulfilled: false,
  tracking_token_ttl_days: 14,
};

describe('FulfillmentSettingsComponent', () => {
  async function render() {
    const fulfillment = {
      settings: vi.fn().mockImplementation(async (locationId: string) => ({
        ...settings,
        location_id: locationId,
      })),
      updateSettings: vi.fn().mockImplementation(async (locationId: string, update: object) => ({
        ...settings,
        ...update,
        location_id: locationId,
      })),
    };
    const variantQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    variantQuery['select'] = vi.fn(() => variantQuery);
    variantQuery['eq'] = vi.fn(() => variantQuery);
    variantQuery['order'] = vi.fn(() => variantQuery);
    variantQuery['limit'] = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'fee-1',
          name: 'Default',
          price: 50,
          products: { name: 'Delivery' },
        },
      ],
      error: null,
    });

    await TestBed.configureTestingModule({
      imports: [FulfillmentSettingsComponent],
      providers: [
        { provide: FulfillmentService, useValue: fulfillment },
        {
          provide: LocationContextService,
          useValue: {
            locations: signal([
              { id: 'location-1', name: 'Kiosk 1' },
              { id: 'location-2', name: 'Kiosk 2' },
            ]),
            activeId: signal('location-1'),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PermissionsService,
          useValue: { has: vi.fn().mockReturnValue(true) },
        },
        {
          provide: SupabaseService,
          useValue: { client: { from: vi.fn(() => variantQuery) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FulfillmentSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fulfillment.settings).toHaveBeenCalledWith('location-1'));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, fulfillment };
  }

  it('uses one save action for the complete location draft', async () => {
    const { fixture, fulfillment } = await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('button')].filter(button => button.textContent?.includes('Save'))
    ).toHaveLength(0);

    const pickupPromise = [...root.querySelectorAll('input')].find(
      input => input.getAttribute('type') === 'number'
    ) as HTMLInputElement;
    pickupPromise.value = '45';
    pickupPromise.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(root.textContent).toContain('Unsaved changes for Kiosk 1');
    const saveButtons = [...root.querySelectorAll('button')].filter(button =>
      button.textContent?.includes('Save changes')
    );
    expect(saveButtons).toHaveLength(1);

    saveButtons[0].click();
    await vi.waitFor(() => expect(fulfillment.updateSettings).toHaveBeenCalledTimes(1));
    expect(fulfillment.updateSettings).toHaveBeenCalledWith(
      'location-1',
      expect.objectContaining({ pickup_sla_minutes: 45 })
    );
  });

  it('does not lose a dirty draft when the location changes', async () => {
    const { fixture, fulfillment } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const pickupPromise = [...root.querySelectorAll('input')].find(
      input => input.getAttribute('type') === 'number'
    ) as HTMLInputElement;
    pickupPromise.value = '45';
    pickupPromise.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const location = root.querySelector(
      'select[aria-label="Pickup and delivery location"]'
    ) as HTMLSelectElement;
    location.value = 'location-2';
    location.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fulfillment.settings).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('Save changes to Kiosk 1?');
    expect(root.textContent).toContain('Discard and switch');

    const discardAndSwitch = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Discard and switch')
    ) as HTMLButtonElement;
    discardAndSwitch.click();
    await vi.waitFor(() => expect(fulfillment.settings).toHaveBeenCalledWith('location-2'));
  });
});
