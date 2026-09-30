import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { TaxService } from '../core/tax.service';
import { SupabaseService } from '../core/supabase.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { DocumentDesignerComponent } from './document-designer.component';
import { SettingsService, type CompanySettings } from './settings.service';
import { ShopSetupComponent } from './shop-setup.component';

@Component({ template: 'Destination' })
class DestinationComponent {}

describe('Shop setup document integration', () => {
  afterEach(() => vi.restoreAllMocks());

  async function render(logoPath: string | null = null) {
    const settings = {
      id: 'company-1',
      name: 'Test shop',
      logo_path: logoPath,
      public_slug: 'test-shop',
      shop_setup: { identity_reviewed: true },
      document_designs: {},
    } as CompanySettings;
    const getPublicUrl = vi.fn((path: string) => ({
      data: { publicUrl: `https://storage.example.test/company-logos/${path}` },
    }));
    const print = {
      format: signal('receipt-52mm'),
      printDocument: vi.fn().mockResolvedValue(undefined),
    };
    const setupRoute = routes
      .find(route => route.path === '')!
      .children!.find(route => route.path === 'shop-setup')!;
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'shop-setup',
            component: ShopSetupComponent,
            canDeactivate: setupRoute.canDeactivate,
          },
          {
            path: 'settings/documents',
            component: DocumentDesignerComponent,
            canDeactivate: setupRoute.canDeactivate,
          },
          { path: 'dashboard', component: DestinationComponent },
          { path: 'settings', component: DestinationComponent },
        ]),
        {
          provide: SupabaseService,
          useValue: {
            offlineIdentity: signal({ companyId: settings.id, userId: 'user' }),
            client: { storage: { from: vi.fn(() => ({ getPublicUrl })) } },
          },
        },
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
        { provide: ReceiptDataService, useValue: { invalidateCompanyInfo: vi.fn() } },
        { provide: PrintService, useValue: print },
      ],
    }).compileComponents();
    const service = TestBed.inject(SettingsService);
    vi.spyOn(service, 'getSettings').mockResolvedValue(settings);
    vi.spyOn(service, 'saveShopSetup').mockImplementation(async patch => ({
      ...settings.shop_setup,
      ...patch,
    }));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/shop-setup', ShopSetupComponent);
    await harness.fixture.whenStable();
    const designer = await harness.navigateByUrl(
      '/settings/documents?from=setup',
      DocumentDesignerComponent
    );
    await harness.fixture.whenStable();
    return { harness, component, designer, print, getPublicUrl, router: TestBed.inject(Router) };
  }

  it('keeps document drafts when leaving is cancelled and leaves only after confirmation', async () => {
    const { designer, router } = await render();
    designer.patch({ message: 'Keep this receipt draft' });
    designer.kind.set('invoice');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(router.url).toBe('/settings/documents?from=setup');
    expect(confirm).toHaveBeenCalledOnce();
    designer.kind.set('receipt');
    expect(designer.draft().message).toBe('Keep this receipt draft');

    confirm.mockReturnValue(true);
    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('does not confirm twice when the designer already confirmed editing shop details', async () => {
    const { harness, designer, router } = await render();
    designer.patch({ message: 'Discard this draft' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    designer.editDetails();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/settings?tab=business');
    expect(confirm).toHaveBeenCalledOnce();
  });

  it.each([
    ['https://cdn.example.test/logo.png', 'https://cdn.example.test/logo.png'],
    ['http://cdn.example.test/logo.png', 'http://cdn.example.test/logo.png'],
    ['company-1/logo.png', 'https://storage.example.test/company-logos/company-1/logo.png'],
  ])('uses the saved logo %s in setup, designer and sample prints', async (path, expected) => {
    const { component, designer, print } = await render(path);
    const imageSource = `src="${expected}"`;
    expect(component.preview()?.html).toContain(imageSource);
    await vi.waitFor(() => expect(designer.preview()?.html).toContain(imageSource));

    await component.testPrint();
    await designer.testPrint();

    expect(print.printDocument).toHaveBeenCalledTimes(2);
    for (const [, html] of print.printDocument.mock.calls) expect(html).toContain(imageSource);
  });
});
