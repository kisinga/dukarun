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
import { PosService } from '../pos/pos.service';
import { ProductsComponent } from './products.component';

async function setup(url: string) {
  const rpc = vi.fn(async () => ({ data: { total: 100, groups: [] }, error: null }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'products', component: ProductsComponent }]),
      { provide: PosService, useValue: {} },
      {
        provide: SupabaseService,
        useValue: {
          client: { rpc },
          offlineIdentity: signal({ userId: 'user', companyId: 'company' }),
        },
      },
      {
        provide: PartyCacheService,
        useValue: { suppliers: signal([]), ensureLoaded: async () => true },
      },
      { provide: LocationContextService, useValue: { activeId: signal('location-1') } },
      { provide: ConnectivityService, useValue: { online: signal(true) } },
      { provide: TaxService, useValue: { settings: async () => ({ categories: [] }) } },
      { provide: CompanyPreferencesService, useValue: { refresh: async () => undefined } },
      { provide: PermissionsService, useValue: { has: () => true } },
      {
        provide: CatalogCacheService,
        useValue: {
          families: signal([]),
          catalog: signal([]),
          catalogTruncated: signal(false),
          stock: signal(new Map()),
          categories: signal([]),
          productCategories: signal([]),
          categoryMembershipsComplete: signal(true),
          manufacturers: signal([]),
          ensureLoaded: async () => true,
        },
      },
    ],
  });
  TestBed.overrideComponent(ProductsComponent, { set: { template: '', imports: [] } });
  await TestBed.compileComponents();
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, ProductsComponent);
  return { harness, component, rpc };
}

describe('Product list URL restoration', () => {
  it.each(['inactive', 'all'])(
    'loads the saved %s view without resetting its page',
    async status => {
      const { component, rpc } = await setup(`/products?status=${status}&search=tea&page=3`);
      await vi.waitFor(() =>
        expect(rpc).toHaveBeenCalledWith(
          'catalog_management_page',
          expect.objectContaining({ p_status: status, p_search: 'tea', p_page: 3 })
        )
      );
      expect(component['page']()).toBe(3);
      expect(component['serverLoaded']()).toBe(true);
    }
  );

  it('keeps the active view cached and loads page one when its status changes', async () => {
    const { harness, component, rpc } = await setup('/products?page=3');
    await harness.fixture.whenStable();
    expect(rpc).not.toHaveBeenCalled();
    component['productStatusFilter'].set('inactive');
    harness.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'catalog_management_page',
        expect.objectContaining({ p_status: 'inactive', p_page: 1 })
      )
    );
  });
});
