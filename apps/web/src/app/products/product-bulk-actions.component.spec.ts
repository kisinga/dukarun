import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { TaxService } from '../core/tax.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { PosService, type Product, type Variant } from '../pos/pos.service';
import { MoneyService } from '../money/money.service';
import { InsightsService } from '../insights/insights.service';
import { PublicProductLinkService } from './public-product-link.service';
import { ProductDetailDrawerComponent } from './product-detail-drawer.component';
import { provideIcons } from '@ng-icons/core';
import {
  heroMagnifyingGlass,
  heroBarsArrowUp,
  heroChevronDoubleLeft,
  heroChevronLeft,
  heroChevronRight,
  heroChevronDoubleRight,
} from '@ng-icons/heroicons/outline';
import { IconComponent } from '../shared/ui/icon.component';
import { ProductsComponent } from './products.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}

async function setup(permissions = ['ManageCatalog', 'ManageStockAdjustments'], count = 30) {
  const families = signal(
    Array.from(
      { length: count },
      (_, i) =>
        ({
          id: `p${i}`,
          name: `Tea ${String(i).padStart(2, '0')}`,
          active: true,
          storefront_published: true,
        }) as Product
    )
  );
  const catalog = signal(
    families().map(
      family =>
        ({
          product_id: family.id,
          variant_id: `v${family.id}`,
          product_name: family.name,
          variant_name: 'Box',
          variant_active: true,
          product_active: true,
          kind: 'service',
          price: 100,
        }) as Variant
    )
  );
  const identity = signal({ userId: 'user', companyId: 'company' });
  const location = signal('location');
  const online = signal(true);
  const complete = signal(true);
  const refresh = vi.fn().mockResolvedValue(true);
  const pos = {
    imageUrl: () => null,
    setProductsStorefrontPublished: vi
      .fn()
      .mockResolvedValue({ product_count: 2, changed_count: 1 }),
    setProductsActive: vi.fn().mockResolvedValue({ product_count: 2, changed_count: 1 }),
    variantsForSelectedProducts: vi.fn().mockResolvedValue(catalog().slice(0, 2)),
  };
  const rpc = vi.fn().mockResolvedValue({ data: { total: 0, groups: [] }, error: null });
  TestBed.configureTestingModule({
    providers: [
      provideIcons({
        heroMagnifyingGlass,
        heroBarsArrowUp,
        heroChevronDoubleLeft,
        heroChevronLeft,
        heroChevronRight,
        heroChevronDoubleRight,
      }),
      provideRouter([{ path: 'products', component: ProductsComponent }]),
      { provide: PosService, useValue: pos },
      {
        provide: SupabaseService,
        useValue: { client: { rpc }, offlineIdentity: identity, session: signal(null) },
      },
      {
        provide: PartyCacheService,
        useValue: { suppliers: signal([]), ensureLoaded: async () => true },
      },
      {
        provide: LocationContextService,
        useValue: { activeId: location, locations: signal([]), isMultiLocation: signal(false) },
      },
      { provide: ConnectivityService, useValue: { online } },
      { provide: TaxService, useValue: { settings: async () => ({ categories: [] }) } },
      {
        provide: CompanyPreferencesService,
        useValue: {
          refresh: async () => undefined,
          lowStockThreshold: signal(5),
          batchExpiryEnabled: signal(false),
        },
      },
      {
        provide: PermissionsService,
        useValue: { has: (permission: string) => permissions.includes(permission) },
      },
      {
        provide: CatalogCacheService,
        useValue: {
          families,
          catalog,
          catalogTruncated: signal(false),
          stock: signal(new Map()),
          categories: signal([]),
          productCategories: signal([]),
          categoryMembershipsComplete: complete,
          manufacturers: signal([]),
          ensureLoaded: async () => true,
          refresh: vi.fn().mockResolvedValue(true),
          refreshAfterMutation: refresh,
        },
      },
      { provide: MoneyService, useValue: {} },
      { provide: InsightsService, useValue: {} },
      { provide: PublicProductLinkService, useValue: {} },
    ],
  });
  TestBed.overrideComponent(IconComponent, { set: { template: '' } });
  TestBed.overrideComponent(ProductDetailDrawerComponent, { set: { template: '' } });
  await TestBed.compileComponents();
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl('/products', ProductsComponent);
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  const select = () => {
    component['toggleProductSelection']('p0');
    component['toggleProductSelection']('p1');
    harness.fixture.detectChanges();
  };
  const buttons = () => Array.from(harness.routeNativeElement!.querySelectorAll('button'));
  return {
    component,
    harness,
    settle,
    select,
    buttons,
    identity,
    location,
    online,
    complete,
    refresh,
    pos,
    rpc,
  };
}

describe('Product multi-select actions', () => {
  it('renders selection on mobile and desktop without edit permission or complete categories', async () => {
    const page = await setup([]);
    page.complete.set(false);
    await page.settle();
    expect(
      page.harness.routeNativeElement!.querySelectorAll('[aria-label="Select Tea 00"]').length
    ).toBe(2);
    page.select();
    const text = page.harness.routeNativeElement!.textContent!;
    expect(text).toContain('2 products selected');
    expect(text).toContain('Print selected labels');
    expect(page.buttons().some(button => button.textContent?.trim() === 'Categorize')).toBe(false);
    expect(page.buttons().some(button => button.textContent?.trim() === 'Activate')).toBe(false);
    page.component['confirmBulkAction']('publish');
    expect(page.component['bulkConfirmation']()).toBeNull();
  });

  it('handles checkbox and Clear events on the rendered page', async () => {
    const page = await setup();
    const checkbox = page.harness.routeNativeElement!.querySelector(
      '[aria-label="Select Tea 00"]'
    ) as HTMLInputElement;
    checkbox.click();
    await page.settle();
    expect(page.component['selectedProductIds']().has('p0')).toBe(true);
    page
      .buttons()
      .find(button => button.textContent?.trim() === 'Clear')!
      .click();
    await page.settle();
    expect(page.component['selectedProductIds']().size).toBe(0);
  });

  it('limits selection to 100 current-page products', async () => {
    const page = await setup(undefined, 130);
    page.component['changePageSize'](100);
    await page.settle();
    page.component['togglePageSelection']();
    expect(page.component['selectedProductIds']().size).toBe(100);
    const offPage = page.component['families']().find(
      product => !page.component['selectedProductIds']().has(product.id)
    )!;
    page.component['toggleProductSelection'](offPage.id);
    expect(page.component['selectedProductIds']().size).toBe(100);
  });

  it.each([
    'stockStatusFilter',
    'supplierFilter',
    'manufacturerFilter',
    'categoryFilter',
    'productSort',
  ] as const)('clears selection when %s changes', async field => {
    const page = await setup();
    page.select();
    const values = {
      stockStatusFilter: 'not_tracked',
      supplierFilter: 'supplier',
      manufacturerFilter: 'unassigned',
      categoryFilter: 'uncategorized',
      productSort: 'variants',
    } as const;
    page.component[field].set(values[field] as never);
    await page.settle();
    expect(page.component['selectedProductIds']().size).toBe(0);
  });

  it('gates only categorization on category completeness and gates actions individually', async () => {
    const page = await setup(['ManageCatalog']);
    page.complete.set(false);
    await page.settle();
    page.select();
    expect(
      page.buttons().find(button => button.textContent?.trim() === 'Categorize')?.disabled
    ).toBe(true);
    expect(
      page.buttons().find(button => button.textContent?.trim() === 'Publish on storefront')
        ?.disabled
    ).toBe(false);
    expect(page.buttons().some(button => button.textContent?.trim() === 'Deactivate')).toBe(false);
  });

  it('selects only the current page and clears when changing pages and list criteria', async () => {
    const page = await setup();
    page.component['togglePageSelection']();
    expect(page.component['selectedProductIds']().size).toBe(25);
    page.component['changePage'](2);
    await page.settle();
    expect(page.component['selectedProductIds']().size).toBe(0);
    page.component['togglePageSelection']();
    expect(page.component['selectedProductIds']().size).toBe(5);
    page.component['productSortDirection'].set('desc');
    await page.settle();
    expect(page.component['selectedProductIds']().size).toBe(0);
    page.select();
    page.component['query'].set('Tea');
    await page.settle();
    expect(page.component['selectedProductIds']().size).toBe(0);
  });

  it('freezes submitted IDs, blocks offline/saving actions, and retains selection on failure', async () => {
    const page = await setup();
    page.select();
    page.online.set(false);
    page.component['confirmBulkAction']('unpublish');
    expect(page.component['bulkConfirmation']()).toBeNull();
    page.online.set(true);
    const write = deferred<{ product_count: number; changed_count: number }>();
    page.pos.setProductsStorefrontPublished.mockReturnValue(write.promise);
    page.component['confirmBulkAction']('unpublish');
    const saving = page.component['saveBulkAction']();
    page.component['toggleProductSelection']('p2');
    expect(page.component['selectedProductIds']().size).toBe(2);
    expect(page.pos.setProductsStorefrontPublished).toHaveBeenCalledWith(['p0', 'p1'], false);
    write.reject(new Error('Write rejected'));
    await saving;
    expect(page.component['selectedProductIds']().size).toBe(2);
    expect(page.component['bulkError']()).toBe('Write rejected');
    expect(page.refresh).not.toHaveBeenCalled();
  });

  it('retries only refresh after a committed write and clears after reconciliation', async () => {
    const page = await setup();
    page.select();
    page.refresh.mockResolvedValueOnce(false);
    page.component['confirmBulkAction']('deactivate');
    await page.component['saveBulkAction']();
    expect(page.component['bulkError']()).toBe('Saved; refresh failed');
    expect(page.component['selectedProductIds']().size).toBe(2);
    await page.component['retryBulkRefresh']();
    expect(page.pos.setProductsActive).toHaveBeenCalledExactlyOnceWith(['p0', 'p1'], false);
    expect(page.refresh).toHaveBeenCalledTimes(2);
    expect(page.component['selectedProductIds']().size).toBe(0);
  });

  it.each(['user', 'company', 'location'])(
    'discards a pending write after a %s change',
    async scope => {
      const page = await setup();
      page.select();
      const write = deferred<{ product_count: number; changed_count: number }>();
      page.pos.setProductsActive.mockReturnValue(write.promise);
      page.component['confirmBulkAction']('activate');
      const saving = page.component['saveBulkAction']();
      if (scope === 'location') page.location.set('other');
      else
        page.identity.set({
          userId: scope === 'user' ? 'other' : 'user',
          companyId: scope === 'company' ? 'other' : 'company',
        });
      await page.settle();
      write.resolve({ product_count: 2, changed_count: 2 });
      await saving;
      expect(page.refresh).not.toHaveBeenCalled();
      expect(page.component['bulkError']()).toBeNull();
      expect(page.component['selectedProductIds']().size).toBe(0);
    }
  );

  it('preserves selection and pending saves when the token refreshes in the same workspace', async () => {
    const page = await setup();
    page.select();
    page.identity.set({ ...page.identity() });
    await page.settle();
    expect([...page.component['selectedProductIds']()]).toEqual(['p0', 'p1']);

    const write = deferred<{ product_count: number; changed_count: number }>();
    page.pos.setProductsActive.mockReturnValue(write.promise);
    page.component['confirmBulkAction']('deactivate');
    const saving = page.component['saveBulkAction']();
    page.identity.set({ ...page.identity() });
    await page.settle();
    expect(page.component['bulkBusy']()).toBe(true);
    expect(page.component['selectedProductIds']().size).toBe(2);

    write.resolve({ product_count: 2, changed_count: 2 });
    await saving;
    expect(page.refresh).toHaveBeenCalledOnce();
    expect(page.component['selectedProductIds']().size).toBe(0);
    expect(page.component['notice']()).toBe('Selected products saved.');
  });

  it('keeps label preparation alive when the token refreshes in the same workspace', async () => {
    const page = await setup();
    page.select();
    const read = deferred<Variant[]>();
    page.pos.variantsForSelectedProducts.mockReturnValue(read.promise);
    const preparing = page.component['prepareSelectedLabels']();
    const abortSignal = page.pos.variantsForSelectedProducts.mock.calls[0][1];
    page.identity.set({ ...page.identity() });
    await page.settle();
    expect(abortSignal.aborted).toBe(false);
    expect(page.component['labelsPreparing']()).toBe(true);
    read.resolve([]);
    await preparing;
    expect(page.component['labelDialogMode']()).toBe('selection');
    expect(page.component['selectedProductIds']().size).toBe(2);
    page.component['closeLabelDialog']();
  });

  it('waits for a post-mutation refresh before clearing selection', async () => {
    const page = await setup();
    page.select();
    const refreshed = deferred<boolean>();
    page.refresh.mockReturnValue(refreshed.promise);
    page.component['confirmBulkAction']('unpublish');
    const saving = page.component['saveBulkAction']();
    await vi.waitFor(() => expect(page.refresh).toHaveBeenCalledOnce());
    expect(TestBed.inject(CatalogCacheService).refresh).not.toHaveBeenCalled();
    expect(page.component['bulkBusy']()).toBe(true);
    expect(page.component['selectedProductIds']().size).toBe(2);
    refreshed.resolve(false);
    await saving;
    expect(page.component['bulkError']()).toBe('Saved; refresh failed');

    page.identity.set({ ...page.identity() });
    await page.settle();
    expect(page.component['bulkRefreshPending']()).toBe(true);
    expect(page.component['selectedProductIds']().size).toBe(2);
    page.refresh.mockResolvedValue(true);
    await page.component['retryBulkRefresh']();
    expect(page.pos.setProductsStorefrontPublished).toHaveBeenCalledOnce();
    expect(page.component['selectedProductIds']().size).toBe(0);
  });

  it('refreshes the management view after saving', async () => {
    const page = await setup();
    page.component['productStatusFilter'].set('all');
    await page.settle();
    page.component['selectedProductIds'].set(new Set(['p0']));
    page.component['confirmBulkAction']('activate');
    const before = page.rpc.mock.calls.length;
    await page.component['saveBulkAction']();
    expect(page.rpc.mock.calls.length).toBeGreaterThan(before);
    expect(page.refresh).toHaveBeenCalledOnce();
  });

  it('keeps a refresh-only retry when the management page fails after a saved mutation', async () => {
    const page = await setup();
    page.component['productStatusFilter'].set('all');
    await page.settle();
    page.component['selectedProductIds'].set(new Set(['p0']));
    page.component['confirmBulkAction']('activate');
    page.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Management unavailable' } });
    await page.component['saveBulkAction']();
    expect(page.component['bulkError']()).toBe('Saved; refresh failed');
    await page.component['retryBulkRefresh']();
    expect(page.pos.setProductsActive).toHaveBeenCalledOnce();
    expect(page.component['bulkRefreshPending']()).toBe(false);
  });

  it('prepares complete selected labels without clearing selection when closing', async () => {
    const page = await setup();
    page.select();
    await page.component['prepareSelectedLabels']();
    expect(page.pos.variantsForSelectedProducts).toHaveBeenCalledWith(
      ['p0', 'p1'],
      expect.any(AbortSignal)
    );
    expect(page.component['selectedLabelVariants']().length).toBe(2);
    expect(page.component['labelDialogMode']()).toBe('selection');
    page.component['closeLabelDialog']();
    expect(page.component['selectedProductIds']().size).toBe(2);
  });

  it('cancels preparation on workspace changes and never shows partial results on failure', async () => {
    const page = await setup();
    page.select();
    const read = deferred<Variant[]>();
    page.pos.variantsForSelectedProducts.mockReturnValue(read.promise);
    const loading = page.component['prepareSelectedLabels']();
    const signal = page.pos.variantsForSelectedProducts.mock.calls[0][1];
    page.location.set('other');
    await page.settle();
    expect(signal.aborted).toBe(true);
    read.resolve([]);
    await loading;
    expect(page.component['labelDialogMode']()).toBeNull();
    page.select();
    page.pos.variantsForSelectedProducts.mockRejectedValue(new Error('Load failed'));
    await page.component['prepareSelectedLabels']();
    expect(page.component['bulkError']()).toBe('Load failed');
    expect(page.component['labelDialogMode']()).toBeNull();
  });
});
