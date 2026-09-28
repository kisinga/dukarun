import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CatalogSearchService } from '../core/catalog-search.service';
import { CatalogIdentityLookupService } from '../core/identity-lookup.services';
import { LocationContextService } from '../core/location-context.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { StockAdjustmentsComponent } from './stock-adjustments.component';
import { StockAdjustmentsService } from './stock-adjustments.service';

async function setup(url: string) {
  const history = vi.fn(async () => ({ rows: [], total: 100 }));
  const activeId = signal('location-1');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'adjustments', component: StockAdjustmentsComponent }]),
      { provide: MoneyService, useValue: {} },
      {
        provide: PosService,
        useValue: {
          variantById: async (variant_id: string) => ({
            variant_id,
            stock: 10,
            track_inventory: true,
            kind: 'stock',
          }),
          variantBatches: async () => [],
        },
      },
      { provide: CatalogSearchService, useValue: {} },
      { provide: CatalogCacheService, useValue: {} },
      {
        provide: CatalogIdentityLookupService,
        useValue: { resolve: async () => ({ items: new Map() }) },
      },
      { provide: LocationContextService, useValue: { activeId } },
      { provide: StockAdjustmentsService, useValue: { history } },
    ],
  });
  TestBed.overrideComponent(StockAdjustmentsComponent, { set: { template: '', imports: [] } });
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, StockAdjustmentsComponent);
  await harness.fixture.whenStable();
  return { harness, component, history, activeId };
}

describe('Stock adjustment history URL restoration', () => {
  it.each(['', '&search=damaged'])(
    'preserves the product history page on reload%s',
    async search => {
      const { harness, component, history } = await setup(
        `/adjustments?variant=v1&page=3${search}`
      );
      // Let the search debounce finish, as it must not reset restored pagination.
      await new Promise(resolve => setTimeout(resolve, 300));
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      expect(component['historyPage']()).toBe(3);
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ variantId: 'v1', page: 3 })
      );
      expect(TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams['page']).toBe(
        '3'
      );
    }
  );

  it('resets history to page one when the user picks another product', async () => {
    const { component, history } = await setup('/adjustments?variant=v1&page=3');
    await component['pick']({ ...component['selected']()!, variant_id: 'v2' });
    expect(history).toHaveBeenLastCalledWith(expect.objectContaining({ variantId: 'v2', page: 1 }));
  });

  it('resets history to page one after a new search', async () => {
    const { harness, component, history } = await setup(
      '/adjustments?variant=v1&page=3&search=damaged'
    );
    component['historySearch'].setValue('lost');
    await vi.waitFor(() => {
      harness.fixture.detectChanges();
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'lost', page: 1 })
      );
    });
  });
});
