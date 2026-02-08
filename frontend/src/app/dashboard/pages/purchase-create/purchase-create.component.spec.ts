/**
 * PurchaseCreateComponent tests
 *
 * Prefill: handleProductSelect sets quantity 1 and unitCost from wholesale (cents to units).
 * Modal: onVariantSelectedFromModal calls handleProductSelect and closes modal.
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { DeepLinkService } from '../../../core/services/deep-link.service';
import { LedgerService } from '../../../core/services/ledger/ledger.service';
import {
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

describe('PurchaseCreateComponent', () => {
  let component: PurchaseCreateComponent;
  let fixture: ComponentFixture<PurchaseCreateComponent>;
  let purchaseService: jasmine.SpyObj<Pick<PurchaseService, 'initializeDraft' | 'purchaseDraft'>>;
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
          useValue: { queryParams: of({}) },
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

  describe('handleProductSelect (form prefill)', () => {
    it('should set quantity to 1 and unitCost from wholesalePrice (cents to units)', () => {
      const variant = makeVariant({
        id: 'v1',
        customFields: { wholesalePrice: 500 },
      });
      component.handleProductSelect(variant);
      const item = component.newLineItem();
      expect(item.quantity).toBe(1);
      expect(item.unitCost).toBe(5);
      expect(item.variantId).toBe('v1');
      expect(item.stockLocationId).toBe('loc1');
    });

    it('should set unitCost to 0 when wholesalePrice is not present', () => {
      const variant = makeVariant({ id: 'v2', customFields: undefined });
      component.handleProductSelect(variant);
      const item = component.newLineItem();
      expect(item.quantity).toBe(1);
      expect(item.unitCost).toBe(0);
    });
  });

  describe('onVariantSelectedFromModal', () => {
    it('should call handleProductSelect and close modal', () => {
      const variant = makeVariant({ id: 'v1', customFields: { wholesalePrice: 1000 } });
      component.showVariantPickerModal.set(true);
      component.onVariantSelectedFromModal(variant);
      expect(component.showVariantPickerModal()).toBe(false);
      expect(component.newLineItem().variantId).toBe('v1');
      expect(component.newLineItem().unitCost).toBe(10);
    });
  });
});
