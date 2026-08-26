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
    component.completeDetails();

    const draft = component.build();
    expect(draft).toMatchObject({
      customer: {
        customer_id: null,
        name: 'David Delivery',
        phone: '+254722000000',
        save_as_customer: true,
        delivery_address: 'Westlands, Nairobi',
        save_delivery_address: true,
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
    component.completeDetails();
    expect(component.build()?.fulfillment).toMatchObject({
      type: 'pickup',
      phone: null,
      transactional_message_consent: false,
    });
  });

  it('prefills a saved customer address and keeps the order snapshot explicit', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('customer', {
      id: 'customer-1',
      name: 'Jane Mwangi',
      phone: '0712345678',
      delivery_address: 'Kilimani, Nairobi',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.selectMode('delivery');
    expect(component.address()).toBe('Kilimani, Nairobi');
    component.completeDetails();

    expect(component.build()).toMatchObject({
      customer: {
        customer_id: 'customer-1',
        delivery_address: 'Kilimani, Nairobi',
        save_delivery_address: true,
      },
      fulfillment: { address: 'Kilimani, Nairobi' },
    });
  });

  it('can keep a changed address on this order without replacing the customer default', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('customer', {
      id: 'customer-1',
      name: 'Jane Mwangi',
      phone: '0712345678',
      delivery_address: 'Kilimani, Nairobi',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.selectMode('delivery');
    component.address.set('Westlands, Nairobi');
    component.saveDeliveryAddress.set(false);
    component.completeDetails();

    expect(component.build()).toMatchObject({
      customer: { save_delivery_address: false },
      fulfillment: { address: 'Westlands, Nairobi' },
    });
  });

  it('restores committed details when an edit is cancelled', async () => {
    const component = (await render()).componentInstance;
    component.selectMode('delivery');
    component.recipientName.set('David Delivery');
    component.phone.set('0722000000');
    component.address.set('Westlands, Nairobi');
    component.completeDetails();

    component.openDetails();
    component.address.set('Changed address');
    component.cancelDetails();

    expect(component.address()).toBe('Westlands, Nairobi');
    expect(component.detailsCommitted()).toBe(true);
  });

  it('emits pickup or delivery mode only after details are committed', async () => {
    const component = (await render()).componentInstance;
    const modeChanges: string[] = [];
    component.modeChanged.subscribe(mode => modeChanges.push(mode));

    component.selectMode('delivery');
    expect(component.detailsOpen()).toBe(true);
    expect(modeChanges).toEqual([]);

    component.recipientName.set('David Delivery');
    component.phone.set('0722000000');
    component.address.set('Westlands, Nairobi');
    component.cancelDetails();
    expect(modeChanges).toEqual([]);
    expect(component.mode()).toBe('counter');

    component.selectMode('pickup');
    component.recipientName.set('Alice Pickup');
    component.updatesRequested.set(false);
    component.completeDetails();

    expect(modeChanges).toEqual(['pickup']);
  });

  it('invalidates customer-derived details when the customer is cleared', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('customer', {
      id: 'customer-1',
      name: 'Jane Mwangi',
      phone: '0712345678',
      delivery_address: 'Kilimani, Nairobi',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.selectMode('delivery');
    component.completeDetails();
    expect(component.detailsCommitted()).toBe(true);

    fixture.componentRef.setInput('customer', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.recipientName()).toBe('');
    expect(component.phone()).toBe('');
    expect(component.address()).toBe('');
    expect(component.detailsCommitted()).toBe(false);
    expect(component.build()).toBeNull();
  });
});
