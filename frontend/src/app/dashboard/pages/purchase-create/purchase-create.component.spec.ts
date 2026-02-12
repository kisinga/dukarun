/**
 * PurchaseCreateComponent tests.
 *
 * Composition: product/variant selection and prefill (qty, unitCost from wholesale) live in
 * PurchaseItemEntryModalComponent. This component wires search → modal open and modal itemAdded → add line.
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { DeepLinkService } from '../../../core/services/deep-link.service';
import { LedgerService } from '../../../core/services/ledger/ledger.service';
import {
  ProductSearchResult,
  ProductSearchService,
  ProductVariant,
} from '../../../core/services/product/product-search.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { PurchaseCreateComponent } from './purchase-create.component';

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'v1',
    name: 'Variant A',
    sku: 'SKU-A',
    priceWithTax: 1000,
    stockLevel: 'IN_STOCK',
    productId: 'p1',
    productName: 'Product One',
    ...overrides,
  };
}

function makeProduct(variants: ProductVariant[] = [makeVariant()]): ProductSearchResult {
  return {
    id: 'p1',
    name: 'Product One',
    slug: 'product-one',
    variants: variants.length > 0 ? variants : undefined,
  } as ProductSearchResult;
}

describe('PurchaseCreateComponent', () => {
  let component: PurchaseCreateComponent;
  let fixture: ComponentFixture<PurchaseCreateComponent>;
  let purchaseService: jasmine.SpyObj<
    Pick<
      PurchaseService,
      | 'initializeDraft'
      | 'purchaseDraft'
      | 'addPurchaseItemLocal'
      | 'removePurchaseItemLocal'
      | 'updatePurchaseItemLocal'
      | 'updateDraftField'
      | 'submitPurchase'
      | 'clearError'
      | 'prepopulateItems'
    >
  >;
  let stockLocationService: {
    locations: ReturnType<typeof signal>;
    fetchStockLocations: jasmine.Spy;
  };

  beforeEach(async () => {
    const locationsSignal = signal([{ id: 'loc1', name: 'Main' }]);
    stockLocationService = {
      locations: locationsSignal,
      fetchStockLocations: jasmine.createSpy().and.returnValue(Promise.resolve()),
    };

    purchaseService = jasmine.createSpyObj('PurchaseService', [
      'initializeDraft',
      'addPurchaseItemLocal',
      'removePurchaseItemLocal',
      'updatePurchaseItemLocal',
      'updateDraftField',
      'submitPurchase',
      'clearError',
      'prepopulateItems',
    ]);
    purchaseService.initializeDraft.and.stub();
    (purchaseService as any).purchaseDraft = signal({
      supplierId: null,
      purchaseDate: new Date(),
      referenceNumber: '',
      notes: '',
      lines: [],
      paymentStatus: 'PENDING',
      paymentAmount: 0,
      paymentAccountCode: null,
      paymentReference: null,
    });
    (purchaseService as any).isLoading = signal(false);
    (purchaseService as any).error = signal(null);
    (purchaseService as any).totalCost = signal(0);

    await TestBed.configureTestingModule({
      imports: [PurchaseCreateComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PurchaseService, useValue: purchaseService },
        {
          provide: SupplierService,
          useValue: {
            suppliers: signal([]),
            fetchSuppliers: jasmine.createSpy(),
          },
        },
        { provide: StockLocationService, useValue: stockLocationService },
        {
          provide: ProductSearchService,
          useValue: { searchProducts: jasmine.createSpy(), getVariantById: jasmine.createSpy() },
        },
        {
          provide: LedgerService,
          useValue: { loadEligibleDebitAccounts: () => of([]) },
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
            snapshot: {
              queryParamMap: { get: () => null },
            },
          },
        },
        {
          provide: DeepLinkService,
          useValue: { processQueryParams: jasmine.createSpy().and.returnValue(Promise.resolve()) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('onVariantSelectedFromSearch', () => {
    it('should open item entry modal with product and variant set', () => {
      const product = makeProduct([makeVariant({ id: 'v1' })]);
      const variant = makeVariant({ id: 'v1' });

      component.onVariantSelectedFromSearch({ product, variant });

      expect(component.showItemEntryModal()).toBe(true);
      expect(component.itemEntryProduct()).toBe(product);
      expect(component.itemEntryVariant()).toBe(variant);
    });
  });

  describe('onItemAddedFromModal', () => {
    it('should add line via purchaseService and close modal', () => {
      const variant = makeVariant({ id: 'v1' });
      component.onItemAddedFromModal({ variant, quantity: 1, unitCost: 10 });

      expect(purchaseService.addPurchaseItemLocal).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          variantId: 'v1',
          quantity: 1,
          unitCost: 10,
          stockLocationId: 'loc1',
        }),
      );
      expect(component.showItemEntryModal()).toBe(false);
      expect(component.itemEntryProduct()).toBeNull();
      expect(component.itemEntryVariant()).toBeNull();
    });
  });

  describe('closeItemEntryModal', () => {
    it('should clear modal state', () => {
      const product = makeProduct();
      component.itemEntryProduct.set(product);
      component.itemEntryVariant.set(makeVariant());
      component.showItemEntryModal.set(true);

      component.closeItemEntryModal();

      expect(component.showItemEntryModal()).toBe(false);
      expect(component.itemEntryProduct()).toBeNull();
      expect(component.itemEntryVariant()).toBeNull();
    });
  });
});
