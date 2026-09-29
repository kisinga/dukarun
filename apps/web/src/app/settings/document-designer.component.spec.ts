import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDesign } from '@dukarun/documents';
import { DocumentDesignerComponent } from './document-designer.component';
import { CompanySettingsStore } from './company-settings.store';
import { PrintService } from '../shared/print/print.service';
import { TaxService } from '../core/tax.service';
import type { CompanySettings } from './settings.service';

describe('Document designer drafts', () => {
  afterEach(() => vi.restoreAllMocks());
  async function render() {
    const settings = signal({
      id: 'one',
      name: 'Test shop',
      address: 'Nairobi',
      logo_path: null,
      document_designs: {},
    } as CompanySettings);
    const store = {
      settings,
      load: vi.fn(async () => settings()),
      logoPublicUrl: vi.fn(),
      saveDesign: vi.fn(async (kind, design) => {
        settings.update(s => ({
          ...s,
          document_designs: { ...s.document_designs, [kind]: design },
        }));
      }),
    };
    const print = {
      format: signal('receipt-52mm'),
      printDocument: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [DocumentDesignerComponent],
      providers: [
        provideRouter([]),
        {
          provide: TaxService,
          useValue: {
            settings: vi.fn().mockResolvedValue({
              active_profile: null,
              categories: [],
              show_vat_breakdown_on_prints: true,
            }),
          },
        },
        { provide: CompanySettingsStore, useValue: store },
        { provide: PrintService, useValue: print },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentDesignerComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, store, print };
  }
  it('keeps drafts per type, saves only the selected design, and confirms dirty close', async () => {
    const { fixture, component, store } = await render();
    component.patch({ message: 'Receipt draft' });
    component.kind.set('invoice');
    component.setLayout('modern');
    expect(store.settings().document_designs).toEqual({});
    component.kind.set('receipt');
    expect(component.draft().message).toBe('Receipt draft');
    await component.save();
    expect(store.saveDesign).toHaveBeenCalledWith(
      'receipt',
      expect.objectContaining({ message: 'Receipt draft' })
    );
    expect(component.dirty()).toBe(true);
    fixture.detectChanges();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    component.kind.set('invoice');
    component.discard();
    expect(component.dirty()).toBe(false);
  });
  it('updates text immediately and keeps the preview present while preparing a changed QR', async () => {
    const { component } = await render();
    component.custom('value', 'https://example.test/one');
    component.custom('display', 'both');
    expect(component.preview()?.html).toContain('Preparing QR code');
    component.patch({ message: 'Immediate message' });
    expect(component.preview()?.html).toContain('Immediate message');
    await vi.waitFor(() => expect(component.preview()?.html).toContain('<svg'));
    component.custom('value', 'https://example.test/two');
    expect(component.preview()?.html).toContain('https://example.test/two');
    expect(component.preview()?.html).not.toContain('<svg');
    await vi.waitFor(() => expect(component.preview()?.html).toContain('<svg'));
  });
  it('keeps VAT presentation per document and restores inheritance', async () => {
    const { component } = await render();
    component.patch({ showVatBreakdown: false });
    component.kind.set('invoice');
    expect(component.draft().showVatBreakdown).toBeUndefined();
    component.kind.set('receipt');
    expect(component.showVat()).toBe(false);
    component.inheritVat();
    expect(component.draft().showVatBreakdown).toBeUndefined();
    expect(component.dirty()).toBe(false);
  });
  it('test prints the draft sample without saving or creating a transaction', async () => {
    const { component, store, print } = await render();
    component.patch({ message: 'Unsaved sample' });
    await vi.waitFor(() => expect(component.preview()?.html).toContain('Unsaved sample'));
    await component.testPrint();
    expect(print.printDocument).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('SAMPLE — NOT A TRANSACTION'),
      expect.any(String)
    );
    expect(store.saveDesign).not.toHaveBeenCalled();
    expect(store.settings().document_designs).toEqual({});
  });
  it('previews the configured VAT split when sales VAT is off, with an explicit sample-only notice', async () => {
    const { component, print } = await render();
    await vi.waitFor(() => expect(component.taxSettings()).not.toBeNull());
    component.taxSettings.set({
      active_profile: { vat_registered: false, default_tax_category_id: 'standard' },
      categories: [
        { id: 'standard', is_default: true, rate_bps: 1600, classification: 'standard' },
      ],
      show_vat_breakdown_on_prints: false,
    } as any);
    component.kind.set('cashier-slip');
    component.patch({ showVatBreakdown: true });
    expect(component.preview()?.html).toContain('Net amount');
    expect(component.preview()?.html).toContain('VAT 16%');
    expect(component.preview()?.html).toContain('KES 431');
    expect(component.preview()?.html).toContain('KES 69');
    expect(component.preview()?.html).toContain('VAT layout example only');
    expect(component.taxStatus()).toContain('VAT calculation is off for sales');
    await component.testPrint();
    expect(print.printDocument).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('VAT layout example only'),
      expect.any(String)
    );
    component.patch({ showVatBreakdown: false });
    expect(component.preview()?.html).not.toContain('Net amount');
    expect(component.preview()?.html).not.toContain('VAT layout example only');
  });
  it('restores defaults as a draft and retains edits if saving fails', async () => {
    const { component, store } = await render();
    component.setLayout('compact');
    component.restore();
    expect(component.draft()).toEqual(defaultDesign('receipt'));
    component.patch({ message: 'Keep this' });
    store.saveDesign.mockRejectedValueOnce(new Error('Offline'));
    await component.save();
    expect(component.draft().message).toBe('Keep this');
    expect(component.error()).toBe('Offline');
  });
});
