import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FulfillmentCheckoutFieldsComponent } from './fulfillment-checkout-fields.component';
import { FulfillmentService, type FulfillmentSettings } from './fulfillment.service';

const settings: FulfillmentSettings = {
  company_id: 'company-1',
  location_id: 'location-1',
  enabled: true,
  feature_available: true,
  pickup_enabled: true,
  delivery_enabled: true,
  cod_enabled: true,
  default_delivery_fee_variant_id: 'fee-variant',
  pickup_sla_minutes: 30,
  delivery_sla_minutes: 60,
  notification_channel: 'sms',
  sms_fallback: false,
  notify_initial: true,
  notify_ready: true,
  notify_in_transit: true,
  notify_failed: true,
  notify_fulfilled: false,
  tracking_token_ttl_days: 14,
  delivery_fee_variant: null,
};

describe('FulfillmentCheckoutFieldsComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [FulfillmentCheckoutFieldsComponent],
      providers: [{ provide: FulfillmentService, useValue: { matchCustomers: vi.fn() } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FulfillmentCheckoutFieldsComponent);
    fixture.componentRef.setInput('settings', settings);
    fixture.detectChanges();
    return fixture;
  }

  it('builds an immutable COD delivery snapshot with a normalized Kenyan phone', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;

    component.selectMode('delivery');
    component.chooseCod();
    component.recipientName.set('David Delivery');
    component.phone.set('0722 000 000');
    component.address.set('  Westlands, Nairobi  ');
    component.landmark.set('  Sarit Centre  ');
    component.preparationNotes.set('  Pack drinks separately  ');
    component.handoffNotes.set('  Call at the gate  ');

    const draft = component.build();
    expect(draft).toMatchObject({
      customer: {
        customer_id: null,
        name: 'David Delivery',
        phone: '+254722000000',
        save_as_customer: true,
      },
      fulfillment: {
        type: 'delivery',
        collection_kind: 'cod',
        recipient_name: 'David Delivery',
        phone: '+254722000000',
        address: 'Westlands, Nairobi',
        landmark: 'Sarit Centre',
        preparation_notes: 'Pack drinks separately',
        handoff_notes: 'Call at the gate',
        transactional_message_consent: true,
      },
    });
  });

  it('allows pickup without a phone only when tracking updates are off', async () => {
    const component = (await render()).componentInstance;
    component.selectMode('pickup');
    component.recipientName.set('Alice Pickup');

    expect(component.build()).toBeNull();
    expect(component.validationMessage()).toBe('Enter a valid Kenyan mobile number.');

    component.updatesRequested.set(false);
    expect(component.build()?.fulfillment).toMatchObject({
      type: 'pickup',
      phone: null,
      transactional_message_consent: false,
    });
  });
});
