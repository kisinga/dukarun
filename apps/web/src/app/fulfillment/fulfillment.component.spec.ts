import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { LocationContextService } from '../core/location-context.service';
import { MpesaService } from '../core/mpesa.service';
import { PermissionsService } from '../core/permissions.service';
import { FulfillmentComponent } from './fulfillment.component';
import {
  FulfillmentService,
  type FulfillmentBoardRow,
  type FulfillmentDetail,
  type FulfillmentSettings,
} from './fulfillment.service';

const disabledSettings: FulfillmentSettings = {
  company_id: 'company-1',
  location_id: 'location-1',
  enabled: false,
  feature_available: true,
  pickup_enabled: true,
  delivery_enabled: true,
  cod_enabled: false,
  default_delivery_fee_variant_id: null,
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

describe('FulfillmentComponent', () => {
  async function render(
    settings: FulfillmentSettings,
    granted = ['ProcessFulfillments', 'ManageCompanySettings'],
    rows: FulfillmentBoardRow[] = [],
    detail?: FulfillmentDetail
  ) {
    const fulfillment = {
      settings: vi.fn().mockResolvedValue(settings),
      board: vi.fn().mockResolvedValue(rows),
      detail: vi.fn().mockResolvedValue(detail),
      assignees: vi.fn().mockResolvedValue([]),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [FulfillmentComponent],
      providers: [
        { provide: FulfillmentService, useValue: fulfillment },
        {
          provide: LocationContextService,
          useValue: {
            activeId: signal('location-1'),
            active: signal({ id: 'location-1', name: 'Kiosk 1' }),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            ready: signal(true),
            has: (permission: string) => granted.includes(permission),
          },
        },
        { provide: MpesaService, useValue: {} },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FulfillmentComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fulfillment.settings).toHaveBeenCalledWith('location-1'));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, fulfillment, router };
  }

  it('renders a setup state instead of a database error and empty board', async () => {
    const { fixture, fulfillment, router } = await render(disabledSettings);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Pickup & delivery is off here');
    expect(text).toContain('Turn it on for Kiosk 1');
    expect(text).not.toContain('fulfillment_not_enabled_at_location');
    expect(text).not.toContain('Pending');
    expect(fulfillment.board).not.toHaveBeenCalled();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (candidate: HTMLButtonElement) => candidate.textContent?.trim() === 'Open settings'
    ) as HTMLButtonElement;
    button.click();
    expect(router.navigate).toHaveBeenCalledWith(['/settings'], {
      queryParams: { tab: 'fulfillment' },
    });
  });

  it('uses a focused empty state when an enabled board has no active orders', async () => {
    const { fixture, fulfillment } = await render({ ...disabledSettings, enabled: true });
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('No active orders');
    expect(text).toContain('New pickup and delivery orders will appear here.');
    expect(fulfillment.board).toHaveBeenCalledTimes(2);
  });

  it('renders dispatch for an assigned ready delivery', async () => {
    const ready: FulfillmentDetail = {
      id: 'fulfillment-1',
      order_id: 'order-1',
      order_code: 'SO-20',
      fulfillment_type: 'delivery',
      status: 'ready',
      collection_kind: 'none',
      promised_at: null,
      updated_at: new Date().toISOString(),
      state_version: 4,
      assigned_membership_id: 'membership-1',
      assigned_name: 'Delivery Person',
      recipient_name: 'Recipient',
      phone_normalized: '+254700000000',
      address_line: 'Test address',
      landmark: null,
      map_link: null,
      preparation_notes: null,
      handoff_notes: null,
      order_status: 'completed',
      cod_balance: null,
      items: [{ name: 'Order item', quantity: 1 }],
      events: [],
    };
    const { fixture } = await render(
      { ...disabledSettings, enabled: true },
      ['CompleteFulfillments'],
      [ready],
      ready
    );

    const order = [...fixture.nativeElement.querySelectorAll('button')].find(
      (candidate: HTMLButtonElement) => candidate.textContent?.includes('SO-20')
    ) as HTMLButtonElement;
    order.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const dispatch = [...fixture.nativeElement.querySelectorAll('button')].find(
      (candidate: HTMLButtonElement) => candidate.textContent?.includes('Dispatch')
    );
    expect(dispatch).toBeTruthy();
    expect(
      fixture.nativeElement
        .querySelector('app-drawer footer')
        .classList.contains('task-sheet-default-footer')
    ).toBe(false);
  });

  it('keeps preparation actions in the visible drawer footer', async () => {
    const pending: FulfillmentDetail = {
      id: 'fulfillment-2',
      order_id: 'order-2',
      order_code: 'SO-21',
      fulfillment_type: 'delivery',
      status: 'pending',
      collection_kind: 'none',
      promised_at: null,
      updated_at: new Date().toISOString(),
      state_version: 1,
      assigned_membership_id: null,
      assigned_name: null,
      recipient_name: 'Recipient',
      phone_normalized: null,
      address_line: null,
      landmark: null,
      map_link: null,
      preparation_notes: null,
      handoff_notes: null,
      order_status: 'completed',
      cod_balance: null,
      items: [{ name: 'Order item', quantity: 1 }],
      events: [],
    };
    const { fixture } = await render(
      { ...disabledSettings, enabled: true },
      ['ProcessFulfillments'],
      [pending],
      pending
    );

    const order = [...fixture.nativeElement.querySelectorAll('button')].find(
      (candidate: HTMLButtonElement) => candidate.textContent?.includes('SO-21')
    ) as HTMLButtonElement;
    order.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('app-drawer footer') as HTMLElement;
    expect(footer.textContent).toContain('Start preparation');
    expect(footer.classList.contains('task-sheet-default-footer')).toBe(false);
  });
});
