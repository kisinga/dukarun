import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ProductDetailDrawerComponent } from './product-detail-drawer.component';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { PosService, type Product, type Variant } from '../pos/pos.service';
import { MoneyService } from '../money/money.service';
import { InsightsService } from '../insights/insights.service';
import { PublicProductLinkService } from './public-product-link.service';
import { IconComponent } from '../shared/ui/icon.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function setup(
  options: { published?: boolean; legacy?: boolean; permitted?: boolean; online?: boolean } = {}
) {
  const family = {
    id: 'product',
    company_id: 'company',
    name: 'Tea',
    active: true,
    storefront_published: options.published ?? true,
    barcode: null,
    image_path: null,
    manufacturer_id: null,
    tax_category_id: null,
    created_at: '',
    updated_at: '',
  } satisfies Product;
  if (options.legacy) delete (family as Partial<Product>).storefront_published;
  const variant = {
    variant_id: 'variant',
    product_id: 'product',
    variant_name: 'Box',
    variant_active: true,
    kind: 'service',
    track_inventory: false,
    sku: 'TEA',
    price: 100,
  } as Variant;
  const families = signal([family]);
  const online = signal(options.online ?? true);
  const permission = signal(options.permitted ?? true);
  const save = deferred<boolean>();
  const load = deferred<{ family: Product; variants: Variant[] }>();
  const pos = {
    setProductStorefrontPublished: vi.fn(() => save.promise),
    productGroupById: vi.fn(() => load.promise),
  };
  const cache = {
    families,
    catalog: signal([variant]),
    stock: signal(new Map()),
    manufacturers: signal([]),
    categories: signal([]),
    productCategories: signal([]),
    categoryMembershipsComplete: signal(true),
    refresh: vi.fn().mockResolvedValue(true),
  };
  await TestBed.configureTestingModule({
    imports: [ProductDetailDrawerComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogCacheService, useValue: cache },
      { provide: ConnectivityService, useValue: { online } },
      {
        provide: PermissionsService,
        useValue: { has: (p: string) => p === 'ManageCatalog' && permission() },
      },
      { provide: PosService, useValue: pos },
      { provide: CompanyPreferencesService, useValue: { batchExpiryEnabled: signal(false) } },
      { provide: LocationContextService, useValue: { activeId: signal('location') } },
      { provide: PartyCacheService, useValue: { suppliers: signal([]) } },
      { provide: MoneyService, useValue: {} },
      { provide: InsightsService, useValue: {} },
      { provide: PublicProductLinkService, useValue: { load: vi.fn().mockResolvedValue(null) } },
    ],
  })
    .overrideComponent(IconComponent, { set: { template: '' } })
    .compileComponents();
  const fixture = TestBed.createComponent(ProductDetailDrawerComponent);
  fixture.componentRef.setInput('productId', 'product');
  fixture.detectChanges();
  await fixture.whenStable();
  const checkbox = () =>
    fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  const share = () => fixture.nativeElement.querySelector('[aria-label="Share product"]');
  const change = (published: boolean) => {
    checkbox()!.checked = published;
    checkbox()!.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  };
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return {
    fixture,
    family,
    variant,
    online,
    permission,
    pos,
    cache,
    save,
    load,
    checkbox,
    share,
    change,
    settle,
  };
}

describe('Product storefront publication', () => {
  it('waits for the saved state, refreshes the catalogue, and hides sharing after unpublishing', async () => {
    const page = await setup();
    expect(page.share()).not.toBeNull();
    page.change(false);
    expect(page.pos.setProductStorefrontPublished).toHaveBeenCalledWith('product', false);
    expect(page.checkbox()!.checked).toBe(true);
    expect(page.checkbox()!.disabled).toBe(true);
    page.save.resolve(false);
    await page.settle();
    expect(page.checkbox()!.checked).toBe(false);
    await vi.waitFor(() => {
      page.fixture.detectChanges();
      expect(page.checkbox()!.disabled).toBe(false);
    });
    expect(page.cache.refresh).toHaveBeenCalledOnce();
    expect(page.share()).toBeNull();
  });

  it('retains the confirmed state and reports a failed save', async () => {
    const page = await setup();
    page.change(false);
    page.save.reject(new Error('Permission changed. Please refresh.'));
    await page.settle();
    expect(page.checkbox()!.checked).toBe(true);
    expect(page.checkbox()!.disabled).toBe(false);
    expect(page.fixture.nativeElement.textContent).toContain('Permission changed. Please refresh.');
    expect(page.cache.refresh).not.toHaveBeenCalled();
    expect(page.share()).not.toBeNull();
  });

  it('can republish and restore sharing', async () => {
    const page = await setup({ published: false });
    expect(page.share()).toBeNull();
    page.change(true);
    page.save.resolve(true);
    await page.settle();
    expect(page.checkbox()!.checked).toBe(true);
    expect(page.share()).not.toBeNull();
  });

  it('reports refresh failure separately from a successful save', async () => {
    const page = await setup();
    page.cache.refresh.mockResolvedValue(false);
    page.change(false);
    page.save.resolve(false);
    await page.settle();
    expect(page.checkbox()!.checked).toBe(false);
    await vi.waitFor(() => {
      page.fixture.detectChanges();
      expect(page.fixture.nativeElement.textContent).toContain(
        'Visibility saved. Could not refresh'
      );
    });
    expect(page.share()).toBeNull();
  });

  it.each([true, false])(
    'follows later catalogue updates after the publication cache catches up (refresh: %s)',
    async refreshSucceeded => {
      const page = await setup();
      const refresh = deferred<boolean>();
      page.cache.refresh.mockImplementation(() => refresh.promise);
      page.change(false);
      page.save.resolve(false);
      await page.settle();

      // A pending or failed refresh must not revert the confirmed publication.
      expect(page.checkbox()!.checked).toBe(false);
      expect(page.checkbox()!.disabled).toBe(true);
      if (refreshSucceeded) {
        page.cache.families.set([{ ...page.family, storefront_published: false }]);
      }
      refresh.resolve(refreshSucceeded);
      await page.settle();
      await vi.waitFor(() => {
        page.fixture.detectChanges();
        expect(page.checkbox()!.disabled).toBe(false);
      });
      expect(page.checkbox()!.checked).toBe(false);
      if (!refreshSucceeded) {
        expect(page.fixture.nativeElement.textContent).toContain(
          'Visibility saved. Could not refresh'
        );
        page.cache.families.set([{ ...page.family, storefront_published: false }]);
        await page.settle();
      }

      page.cache.families.set([{ ...page.family, name: 'Updated Tea' }]);
      page.cache.catalog.set([{ ...page.variant, variant_name: 'Large box', price: 252 }]);
      await page.settle();

      expect(page.checkbox()!.checked).toBe(true);
      expect(page.share()).not.toBeNull();
      expect(page.fixture.nativeElement.textContent).toContain('Updated Tea');
      const variantRow = page.fixture.nativeElement.querySelector('#product-variant-variant');
      expect(variantRow.textContent).toContain('Large box');
      expect(variantRow.querySelector('app-money').textContent).toContain('252');

      // Variant-only journal updates must also remain reactive.
      page.cache.catalog.set([{ ...page.variant, variant_name: 'Loose tea', price: 375 }]);
      await page.settle();
      expect(variantRow.textContent).toContain('Loose tea');
      expect(variantRow.querySelector('app-money').textContent).toContain('375');
    }
  );

  it('requires ManageCatalog and blocks offline changes', async () => {
    const page = await setup({ permitted: false });
    expect(page.checkbox()).toBeNull();
    page.permission.set(true);
    page.online.set(false);
    await page.settle();
    expect(page.checkbox()!.disabled).toBe(true);
    page.change(false);
    expect(page.pos.setProductStorefrontPublished).not.toHaveBeenCalled();
  });

  it('refreshes a legacy cached record before enabling publication or sharing', async () => {
    const page = await setup({ legacy: true });
    expect(page.pos.productGroupById).toHaveBeenCalledWith('product', null);
    expect(page.checkbox()!.disabled).toBe(true);
    expect(page.share()).toBeNull();
    page.load.resolve({
      family: { ...page.family, storefront_published: false },
      variants: [page.variant],
    });
    await page.settle();
    expect(page.checkbox()!.disabled).toBe(false);
    expect(page.checkbox()!.checked).toBe(false);
    expect(page.share()).toBeNull();
  });

  it('hydrates a legacy offline record when connectivity returns', async () => {
    const page = await setup({ legacy: true, online: false });
    expect(page.pos.productGroupById).not.toHaveBeenCalled();
    expect(page.checkbox()!.disabled).toBe(true);
    page.online.set(true);
    await page.settle();
    expect(page.pos.productGroupById).toHaveBeenCalledOnce();
    page.load.resolve({
      family: { ...page.family, storefront_published: true },
      variants: [page.variant],
    });
    await page.settle();
    expect(page.checkbox()!.disabled).toBe(false);
    expect(page.share()).not.toBeNull();
  });

  it('shows a failed legacy refresh and keeps the control disabled', async () => {
    const page = await setup({ legacy: true });
    page.load.reject(new Error('Could not load product'));
    await page.settle();
    expect(page.checkbox()!.disabled).toBe(true);
    expect(page.fixture.nativeElement.textContent).toContain('Could not load product');
    expect(page.share()).toBeNull();
  });
});
