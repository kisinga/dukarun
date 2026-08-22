import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { IconComponent } from '../shared/ui/icon.component';
import { RestockIntelligenceComponent } from './restock-intelligence.component';
import { ReportsService, type RestockIntelligence } from './reports.service';

const report: RestockIntelligence = {
  days: 30,
  lowStockThreshold: 5,
  summary: {
    products: 1,
    unitsSold: 12,
    sales: 12_000,
    stock: 3,
    stockValue: 1_800,
    restockRisks: 1,
  },
  trend: [
    {
      day: '2026-08-21',
      currentQuantity: 5,
      previousQuantity: 2,
      currentRevenue: 5_000,
      previousRevenue: 2_000,
    },
    {
      day: '2026-08-22',
      currentQuantity: 7,
      previousQuantity: 4,
      currentRevenue: 7_000,
      previousRevenue: 4_000,
    },
  ],
  products: [
    {
      variantId: 'variant-1',
      productId: 'product-1',
      productName: 'Tea',
      variantName: 'Default',
      manufacturerId: 'manufacturer-1',
      manufacturerName: 'Acme',
      currentQuantity: 12,
      currentRevenue: 12_000,
      currentCogs: 7_200,
      currentMargin: 4_800,
      previousQuantity: 6,
      previousRevenue: 6_000,
      stock: 3,
      stockValue: 1_800,
      supplierStock: 3,
      daysCover: 7.5,
      lastSupplierId: 'supplier-1',
      lastSupplierName: 'Fresh Supply',
      lastUnitCost: 600,
      lastPurchaseDate: '2026-08-10',
      lastSoldOn: '2026-08-22',
      trend: [0, 5, 7],
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('RestockIntelligenceComponent', () => {
  async function render(
    restockIntelligence = vi.fn().mockResolvedValue(report),
    manufacturers = [{ id: 'manufacturer-1', name: 'Acme' }]
  ) {
    await TestBed.configureTestingModule({
      imports: [RestockIntelligenceComponent],
      providers: [
        provideRouter([]),
        { provide: ReportsService, useValue: { restockIntelligence } },
        {
          provide: CatalogCacheService,
          useValue: {
            manufacturers: signal(manufacturers),
            ensureLoaded: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: PartyCacheService,
          useValue: {
            suppliers: signal([
              {
                id: 'supplier-1',
                first_name: 'Fresh Supply',
                last_name: null,
                supplier_active: true,
                deleted_at: null,
              },
            ]),
            ensureLoaded: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: LocationContextService,
          useValue: {
            locations: signal([{ id: 'location-1', name: 'Main shop' }]),
            activeId: signal('location-1'),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(RestockIntelligenceComponent);
    fixture.componentRef.setInput('since', '2026-07-24');
    fixture.componentRef.setInput('until', '2026-08-22');
    fixture.detectChanges();
    return { fixture, restockIntelligence };
  }

  it('loads the working location and renders visual restocking facts', async () => {
    const { fixture, restockIntelligence } = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Demand trend');
    });
    expect(restockIntelligence).toHaveBeenCalledWith(
      '2026-07-24',
      '2026-08-22',
      'location-1',
      { supplierId: 'supplier-1', manufacturerId: null },
      50
    );
    expect(fixture.nativeElement.textContent).toContain('Fresh Supply');
    expect(fixture.nativeElement.textContent).toContain('Restock now');
    expect(fixture.nativeElement.querySelector('[role="img"]')).not.toBeNull();
  });

  it('does not let an older source response overwrite a newer one', async () => {
    const first = deferred<RestockIntelligence>();
    const newer = { ...report, summary: { ...report.summary, products: 2 } };
    const restockIntelligence = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(newer);
    const { fixture } = await render(restockIntelligence);
    await vi.waitFor(() => expect(restockIntelligence).toHaveBeenCalledTimes(1));
    (fixture.componentInstance as any).setScopeMode('manufacturer');
    await vi.waitFor(() => expect(restockIntelligence).toHaveBeenCalledTimes(2));
    first.resolve(report);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.componentInstance as any).report().summary.products).toBe(2);
    });
  });

  it('disables an unavailable source and invalidates its pending response', async () => {
    const first = deferred<RestockIntelligence>();
    const restockIntelligence = vi.fn().mockReturnValue(first.promise);
    const { fixture } = await render(restockIntelligence, []);
    await vi.waitFor(() => expect(restockIntelligence).toHaveBeenCalledTimes(1));

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const manufacturerButton = buttons.find(button =>
      button.textContent?.includes('Manufacturer')
    ) as HTMLButtonElement;
    expect(manufacturerButton.disabled).toBe(true);

    (fixture.componentInstance as any).setScopeMode('manufacturer');
    first.resolve(report);
    await Promise.resolve();
    fixture.detectChanges();
    expect((fixture.componentInstance as any).report()).toBeNull();
    expect((fixture.componentInstance as any).loading()).toBe(false);
  });
});
