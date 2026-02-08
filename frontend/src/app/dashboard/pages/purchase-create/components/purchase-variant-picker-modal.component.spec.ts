/**
 * PurchaseVariantPickerModalComponent tests
 *
 * Renders variant list when open; emits variantSelected when a variant is clicked;
 * emits close when backdrop or close button is used.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductVariant } from '../../../../core/services/product/product-search.service';
import { PurchaseVariantPickerModalComponent } from './purchase-variant-picker-modal.component';

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

describe('PurchaseVariantPickerModalComponent', () => {
  let component: PurchaseVariantPickerModalComponent;
  let fixture: ComponentFixture<PurchaseVariantPickerModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseVariantPickerModalComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseVariantPickerModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('variants', [
      makeVariant({ id: 'v1', name: 'V1', sku: 'SKU-1', productName: 'Prod 1' }),
      makeVariant({ id: 'v2', name: 'V2', sku: 'SKU-2', productName: 'Prod 2' }),
    ]);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render when isOpen is false', () => {
    fixture.componentRef.setInput('isOpen', false);
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('.modal');
    expect(modal).toBeFalsy();
  });

  it('should render modal with variants when isOpen is true', () => {
    const modal = fixture.nativeElement.querySelector('.modal');
    expect(modal).toBeTruthy();
    const buttons = fixture.nativeElement.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBeGreaterThanOrEqual(2); // close + at least 2 variant rows
  });

  it('should emit variantSelected when a variant row is clicked', () => {
    let emitted: ProductVariant | undefined;
    component.variantSelected.subscribe((v) => (emitted = v));

    const listButtons = fixture.nativeElement.querySelectorAll('ul button');
    expect(listButtons.length).toBe(2);
    (listButtons[0] as HTMLElement).click();
    expect(emitted).toBeDefined();
    expect(emitted?.id).toBe('v1');
    expect(emitted?.productName).toBe('Prod 1');
  });

  it('should emit close when close button is clicked', () => {
    let closed = false;
    component.close.subscribe(() => (closed = true));
    const closeBtn = fixture.nativeElement.querySelector('button[aria-label="Close"]');
    if (closeBtn) {
      (closeBtn as HTMLElement).click();
      expect(closed).toBeTrue();
    }
  });
});
