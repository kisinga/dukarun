import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PriceEditData, PriceEditSheetComponent } from './price-edit-sheet.component';

describe('PriceEditSheetComponent', () => {
  let component: PriceEditSheetComponent;
  let fixture: ComponentFixture<PriceEditSheetComponent>;
  let currencyFormatSpy: jasmine.Spy;

  const defaultData: PriceEditData = {
    variantId: 'v1',
    productName: 'Product A',
    variantName: 'Variant X',
    currentLinePrice: 300,
    basePrice: 100,
    quantity: 3,
  };

  beforeEach(async () => {
    currencyFormatSpy = jasmine.createSpy('format').and.returnValue('100.00');

    await TestBed.configureTestingModule({
      imports: [PriceEditSheetComponent],
      providers: [
        {
          provide: CurrencyService,
          useValue: { format: currencyFormatSpy, currency: () => 'KES' },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PriceEditSheetComponent);
    component = fixture.componentInstance;
  });

  function openWithData(data: PriceEditData) {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
  }

  describe('prefill', () => {
    it('prefills total and per-item when opened with quantity 3 and line total 300', () => {
      openWithData(defaultData);
      expect(component.priceControl.value).toBe('300.00');
      expect(component.perItemControl.value).toBe('100.00');
    });

    it('prefills per-item from total/quantity for fractional quantity', () => {
      openWithData({
        ...defaultData,
        quantity: 2.5,
        currentLinePrice: 250,
      });
      expect(component.priceControl.value).toBe('250.00');
      expect(component.perItemControl.value).toBe('100.00'); // 250/2.5
    });

    it('leaves per-item empty when quantity is 0', () => {
      openWithData({ ...defaultData, quantity: 0, currentLinePrice: 0 });
      expect(component.priceControl.value).toBe('0.00');
      expect(component.perItemControl.value).toBe('');
    });
  });

  describe('sync total -> per-item', () => {
    it('updates per-item when total is changed', () => {
      openWithData(defaultData);
      component.priceControl.setValue('297');
      fixture.detectChanges();
      expect(component.perItemControl.value).toBe('99.00'); // 297/3
    });

    it('updates per-item when total is changed to 0', () => {
      openWithData(defaultData);
      component.priceControl.setValue('0');
      fixture.detectChanges();
      expect(component.perItemControl.value).toBe('0.00');
    });
  });

  describe('sync per-item -> total', () => {
    it('updates total when per-item is set to 99', () => {
      openWithData(defaultData);
      component.perItemControl.setValue('99');
      fixture.detectChanges();
      expect(component.priceControl.value).toBe('297.00'); // 99*3
    });

    it('does not overwrite total when per-item is invalid or zero', () => {
      openWithData(defaultData);
      const initialTotal = component.priceControl.value;
      component.perItemControl.setValue('');
      fixture.detectChanges();
      expect(component.priceControl.value).toBe(initialTotal);
      component.perItemControl.setValue('0');
      fixture.detectChanges();
      expect(component.priceControl.value).toBe(initialTotal);
    });
  });

  describe('submit', () => {
    it('emits newLinePrice as total in currency units when user edited per-item', () => {
      const emitted: { variantId: string; newLinePrice: number }[] = [];
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('data', defaultData);
      fixture.detectChanges();
      (component.priceUpdated as any).subscribe?.(
        (v: { variantId: string; newLinePrice: number }) => emitted.push(v),
      );
      component.perItemControl.setValue('99');
      fixture.detectChanges();
      component.submit();
      expect(emitted.length).toBe(1);
      expect(emitted[0].variantId).toBe('v1');
      expect(emitted[0].newLinePrice).toBe(297);
    });

    it('emits newLinePrice from total control', () => {
      const emitted: { variantId: string; newLinePrice: number }[] = [];
      openWithData(defaultData);
      (component.priceUpdated as any).subscribe?.(
        (v: { variantId: string; newLinePrice: number }) => emitted.push(v),
      );
      component.priceControl.setValue('350');
      fixture.detectChanges();
      component.submit();
      expect(emitted[0].newLinePrice).toBe(350);
    });
  });

  describe('validation', () => {
    it('isBelowWholesale is true when total is below wholesale * quantity', () => {
      openWithData({
        ...defaultData,
        wholesalePrice: 95,
        currentLinePrice: 280, // 93.33 per item < 95
      });
      expect(component.isBelowWholesale()).toBe(true);
    });

    it('isBelowWholesale is false when total is at or above wholesale * quantity', () => {
      openWithData({
        ...defaultData,
        wholesalePrice: 95,
        currentLinePrice: 285, // 95 per item
      });
      expect(component.isBelowWholesale()).toBe(false);
    });

    it('isAboveBase is true when total exceeds base * quantity', () => {
      openWithData({ ...defaultData, currentLinePrice: 350 });
      expect(component.isAboveBase()).toBe(true);
    });
  });

  describe('resetToBase', () => {
    it('sets both total and per-item to base values', () => {
      openWithData({ ...defaultData, currentLinePrice: 250 });
      component.resetToBase();
      expect(component.priceControl.value).toBe('300.00'); // 100*3
      expect(component.perItemControl.value).toBe('100.00');
    });
  });
});
