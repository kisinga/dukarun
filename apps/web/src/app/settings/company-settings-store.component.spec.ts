import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CompanySettingsStore } from './company-settings.store';
import { SettingsService, type CompanySettings } from './settings.service';
import { SupabaseService } from '../core/supabase.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { DOCUMENT_TYPES, defaultDesign } from '@dukarun/documents';
@Component({ template: '' })
class Host {
  readonly store = inject(CompanySettingsStore);
}
describe('Shared company settings scope', () => {
  it('refreshes every design and the print cache when shared name visibility changes', async () => {
    const identity = signal({ companyId: 'one', userId: 'user' });
    const saved = {
      show_company_name_on_documents: false,
      document_designs: Object.fromEntries(
        DOCUMENT_TYPES.map(kind => [
          kind,
          {
            ...defaultDesign(kind),
            showCompanyName: false,
          },
        ])
      ),
    };
    let resolve!: (value: typeof saved) => void;
    const service = {
      getSettings: vi.fn().mockResolvedValue({ id: 'one', name: 'Shop' }),
      saveDocumentCompanyName: vi
        .fn()
        .mockResolvedValueOnce(saved)
        .mockImplementationOnce(
          () =>
            new Promise<typeof saved>(r => {
              resolve = r;
            })
        ),
    };
    const receipt = { invalidateCompanyInfo: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: SettingsService, useValue: service },
        { provide: SupabaseService, useValue: { offlineIdentity: identity } },
        { provide: ReceiptDataService, useValue: receipt },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const store = fixture.componentInstance.store;
    await store.load();
    await store.saveDocumentCompanyName(false);
    expect(service.saveDocumentCompanyName).toHaveBeenCalledWith(false);
    expect(store.settings()).toMatchObject(saved);
    expect(receipt.invalidateCompanyInfo).toHaveBeenCalledOnce();
    const request = store.saveDocumentCompanyName(true);
    identity.set({ companyId: 'two', userId: 'user' });
    fixture.detectChanges();
    resolve({ ...saved, show_company_name_on_documents: true });
    await request;
    expect(store.settings()).toBeNull();
  });
  it('deduplicates reads, invalidates prints after save, and drops state on company switch', async () => {
    const identity = signal({ companyId: 'one', userId: 'user' });
    const settings = { id: 'one', name: 'Shop', logo_path: null } as CompanySettings;
    const service = {
      getSettings: vi.fn().mockResolvedValue(settings),
      updateSettings: vi.fn().mockResolvedValue(undefined),
    };
    const receipt = { invalidateCompanyInfo: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: SettingsService, useValue: service },
        { provide: SupabaseService, useValue: { offlineIdentity: identity } },
        { provide: ReceiptDataService, useValue: receipt },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    const store = fixture.componentInstance.store;
    const firstLoad = Promise.all([store.load(), store.load()]);
    fixture.detectChanges();
    await firstLoad;
    expect(store.settings()?.name).toBe('Shop');
    expect(service.getSettings).toHaveBeenCalledOnce();
    await store.update({ name: 'Updated shop' });
    expect(store.settings()?.name).toBe('Updated shop');
    expect(receipt.invalidateCompanyInfo).toHaveBeenCalled();
    identity.set({ companyId: 'two', userId: 'user' });
    fixture.detectChanges();
    expect(store.settings()).toBeNull();
  });
  it('discards a load that completes after switching company', async () => {
    const identity = signal({ companyId: 'one', userId: 'user' });
    let resolve!: (s: CompanySettings) => void;
    const service = {
      getSettings: vi.fn(
        () =>
          new Promise<CompanySettings>(r => {
            resolve = r;
          })
      ),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: SettingsService, useValue: service },
        { provide: SupabaseService, useValue: { offlineIdentity: identity } },
        { provide: ReceiptDataService, useValue: { invalidateCompanyInfo: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const store = fixture.componentInstance.store;
    const request = store.load();
    identity.set({ companyId: 'two', userId: 'user' });
    fixture.detectChanges();
    resolve({ id: 'one', name: 'Previous shop' } as CompanySettings);
    await request;
    expect(store.settings()).toBeNull();
  });
});
