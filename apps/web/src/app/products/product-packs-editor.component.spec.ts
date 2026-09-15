import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProductPacksEditorComponent } from './product-packs-editor.component';

describe('ProductPacksEditorComponent', () => {
  it('discards an unfinished pack when removed', () => {
    const fixture = TestBed.createComponent(ProductPacksEditorComponent);
    fixture.componentInstance.changed.subscribe(packs =>
      fixture.componentRef.setInput('packs', packs)
    );
    fixture.detectChanges();
    const click = (label: string) => {
      const button = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
      button.find(button => button.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    click('Add pack');
    expect(fixture.componentInstance.packs()).toHaveLength(1);
    click('Remove pack');
    expect(fixture.componentInstance.packs()).toEqual([]);
  });

  it('retains a saved pack identity when removed', () => {
    const fixture = TestBed.createComponent(ProductPacksEditorComponent);
    const pack = {
      id: 'box',
      name: 'Box',
      units_per_pack: 10,
      sale_price: 100,
      barcode: null,
      active: true,
    };
    fixture.componentRef.setInput('packs', [pack]);
    fixture.componentRef.setInput('savedIds', [pack.id]);
    fixture.componentInstance.changed.subscribe(packs =>
      fixture.componentRef.setInput('packs', packs)
    );
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    buttons.find(button => button.textContent?.trim() === 'Remove Box')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.packs()).toEqual([{ ...pack, active: false }]);
  });
});
