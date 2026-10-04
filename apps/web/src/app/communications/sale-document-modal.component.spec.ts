import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleDocumentModalComponent } from './sale-document-modal.component';
import { SaleDocumentService, type SaleDocumentContext } from './sale-document.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { PermissionsService } from '../core/permissions.service';
import { IconComponent } from '../shared/ui/icon.component';
const base: SaleDocumentContext = {
  order_id: 'sale-1',
  document_number: 'SALE-1',
  total: 100,
  paid: 100,
  balance: 0,
  document_type: 'receipt',
  eligible: true,
  has_customer: false,
  customer: null,
  can_correct_number: true,
  delivery: null,
};
describe('Sale document modal', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  async function render(context = base) {
    const service = {
      modal: signal({ orderId: 'sale-1', celebrate: true }),
      context: vi.fn().mockResolvedValue(context),
      lookup: vi.fn().mockResolvedValue(null),
      send: vi.fn().mockResolvedValue({ outbox_id: 'job-1', state: 'queued' }),
      correctPhone: vi.fn(),
    };
    const print = {
      format: signal('receipt-52mm'),
      getAvailableTemplates: () => [{ id: 'a4', width: '210mm' }],
      setFormat: vi.fn(),
      printOrder: vi.fn().mockResolvedValue(undefined),
    };
    const receipt = {
      buildSaleDocumentData: vi
        .fn()
        .mockResolvedValue({ order: { id: 'sale-1' }, meta: { documentType: 'receipt' } }),
      companyPrintInfo: vi
        .fn()
        .mockResolvedValue({ name: 'Shop', logoUrl: null, address: null, printerEnabled: false }),
    };
    await TestBed.configureTestingModule({
      imports: [SaleDocumentModalComponent],
      providers: [
        { provide: SaleDocumentService, useValue: service },
        { provide: PrintService, useValue: print },
        { provide: ReceiptDataService, useValue: receipt },
        { provide: PermissionsService, useValue: { has: () => true } },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(SaleDocumentModalComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const button = (text: string) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>
      ).find(b => b.textContent?.trim() === text)!;
    return { fixture, service, print, receipt, button };
  }
  it('keeps Print and Done usable with empty contact fields and printing disabled in shop settings', async () => {
    const { fixture, print, button } = await render();
    expect(button('Send PDF via WhatsApp').disabled).toBe(true);
    expect(button('Print').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[autofocus]').tagName).toBe('H2');
    button('Print').click();
    await fixture.whenStable();
    expect(print.printOrder).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
    expect(button('Done').disabled).toBe(false);
  });
  it('renders receipt actions immediately during celebration while customer details are loading', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { fixture, service, button } = await render();
    let resolve!: (context: SaleDocumentContext) => void;
    service.context.mockImplementationOnce(
      () =>
        new Promise<SaleDocumentContext>(done => {
          resolve = done;
        })
    );
    service.modal.set({ orderId: 'sale-loading', celebrate: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sale completed');
    expect(fixture.nativeElement.textContent).toContain('Loading customer details');
    expect(button('Send PDF via WhatsApp').disabled).toBe(true);
    expect(button('Print').disabled).toBe(false);
    expect(button('Done').disabled).toBe(false);
    resolve(base);
    await fixture.whenStable();
  });
  it('keeps invoice balance visible and does not celebrate historical documents', async () => {
    const { fixture, service } = await render({ ...base, document_type: 'invoice', balance: 40 });
    service.modal.set({ orderId: 'sale-history', celebrate: false });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain('Send invoice');
    expect(fixture.nativeElement.textContent).toContain('Balance KES 40');
    expect(fixture.nativeElement.textContent).not.toContain('Sale completed');
  });
  it('shows saved customer details without an editable recipient override', async () => {
    const customer = {
      id: 'customer',
      first_name: 'Amina',
      last_name: null,
      phone: '+254712345678',
      is_verified: true,
      customer_origin: 'manual',
      updated_at: '2026-09-01',
    };
    const { fixture, button, service } = await render({ ...base, has_customer: true, customer });
    expect(fixture.nativeElement.querySelector('input[type="tel"]')).toBeNull();
    expect(button('Send PDF via WhatsApp').disabled).toBe(false);
    button('Send PDF via WhatsApp').click();
    await fixture.whenStable();
    expect(service.send).toHaveBeenCalledWith('sale-1', expect.any(String), undefined);
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
  });
  it('requires deliberate confirmation before resending an unknown outcome', async () => {
    const customer = {
      id: 'customer',
      first_name: 'Amina',
      last_name: null,
      phone: '+254712345678',
      is_verified: false,
      customer_origin: 'receipt',
      updated_at: '2026-09-01',
    };
    const { fixture, button, service } = await render({
      ...base,
      has_customer: true,
      customer,
      delivery: {
        id: 'job',
        state: 'unknown',
        recipient: customer.phone,
        sent_at: null,
        error: null,
      },
    });
    button('Send PDF again via WhatsApp').click();
    fixture.detectChanges();
    expect(service.send).not.toHaveBeenCalled();
    expect(button('Send another PDF')).toBeDefined();
    button('Send another PDF').click();
    await fixture.whenStable();
    expect(service.send).toHaveBeenCalledTimes(1);
  });
  it('retains its idempotency key after uncertain HTTP acceptance', async () => {
    const customer = {
      id: 'customer',
      first_name: 'Amina',
      last_name: null,
      phone: '+254712345678',
      is_verified: true,
      customer_origin: 'manual',
      updated_at: '2026-09-01',
    };
    const { fixture, button, service } = await render({ ...base, has_customer: true, customer });
    service.send.mockRejectedValue(new Error('Network interrupted'));
    button('Send PDF via WhatsApp').click();
    await fixture.whenStable();
    fixture.detectChanges();
    button('Send PDF via WhatsApp').click();
    await fixture.whenStable();
    expect(service.send.mock.calls[0][1]).toBe(service.send.mock.calls[1][1]);
  });

  it('retains acceptance through a failed status fetch, polls again, and confirms any resend', async () => {
    const customer = {
      id: 'customer',
      first_name: 'Amina',
      last_name: null,
      phone: '+254712345678',
      is_verified: true,
      customer_origin: 'manual',
      updated_at: '2026-09-01',
    };
    const ctx = { ...base, has_customer: true, customer };
    const { fixture, button, service } = await render(ctx);
    service.context.mockRejectedValueOnce(new Error('Status fetch failed')).mockResolvedValue({
      ...ctx,
      delivery: {
        id: 'job-1',
        state: 'sent',
        recipient: customer.phone,
        sent_at: null,
        error: null,
      },
    });
    button('Send PDF via WhatsApp').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Queued');
    expect(button('Send PDF again via WhatsApp').disabled).toBe(true);
    button('Send PDF again via WhatsApp').click();
    expect(service.send).toHaveBeenCalledTimes(1);
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Sent');
      },
      { timeout: 3000 }
    );
    expect(fixture.nativeElement.textContent).not.toContain('Status fetch failed');
    button('Send PDF again via WhatsApp').click();
    fixture.detectChanges();
    expect(service.send).toHaveBeenCalledTimes(1);
    button('Send another PDF').click();
    await fixture.whenStable();
    expect(service.send).toHaveBeenCalledTimes(2);
    expect(service.send.mock.calls[0][1]).not.toBe(service.send.mock.calls[1][1]);
  });

  it('shows the celebration and keeps Print available while initial details fail to load', async () => {
    const { fixture, button, service } = await render();
    service.context.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(base);
    service.modal.set({ orderId: 'sale-2', celebrate: true });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Sale completed');
    expect(button('Print').disabled).toBe(false);
    expect(button('Done').disabled).toBe(false);
    expect(button('Send PDF via WhatsApp').disabled).toBe(true);
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Offline');
      },
      { timeout: 3000 }
    );
    expect(service.context).toHaveBeenLastCalledWith('sale-2');
  });
});
