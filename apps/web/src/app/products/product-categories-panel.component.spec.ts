import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { PosService, type CategoryWithCount } from '../pos/pos.service';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ProductCategoriesPanelComponent,
  type ProductCategoryChangedResult,
} from './product-categories-panel.component';

const category = {
  id: 'category-1',
  name: 'Beverages',
  slug: 'beverages',
  description: 'Drinks',
  active: true,
  product_count: 8,
} as CategoryWithCount;

@Component({
  imports: [ProductCategoriesPanelComponent],
  template: `
    <app-product-categories-panel
      [categories]="categories"
      [canManageCatalog]="true"
      [online]="online"
      [membershipComplete]="membershipComplete"
      [dataStatusLabel]="'Reconnect to load category data.'"
      (changed)="changed = $event"
      (failed)="failed = $event"
    />
  `,
})
class HostComponent {
  categories = [category];
  online = true;
  membershipComplete = true;
  changed: ProductCategoryChangedResult | null = null;
  failed: string | null = null;
}

describe('ProductCategoriesPanelComponent', () => {
  async function render() {
    const pos = { upsertCategory: vi.fn().mockResolvedValue('category-1') };
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: PosService, useValue: pos }],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.directive(ProductCategoriesPanelComponent))
      .componentInstance as ProductCategoriesPanelComponent;
    return { fixture, panel: panel as any, pos };
  }

  it('owns edit form state and emits a typed changed result after persistence', async () => {
    const { fixture, panel, pos } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const editButton = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Beverages')
    ) as HTMLButtonElement;

    editButton.click();
    fixture.detectChanges();
    expect(panel.name.value).toBe('Beverages');
    panel.name.setValue('Cold drinks');
    await panel.save();

    expect(pos.upsertCategory).toHaveBeenCalledWith({
      name: 'Cold drinks',
      slug: 'beverages',
      description: 'Drinks',
      category_id: 'category-1',
    });
    expect(fixture.componentInstance.changed).toEqual({
      categoryId: 'category-1',
      message: 'Category updated',
    });
  });

  it('owns category deactivation and keeps product impact in its confirmation data', async () => {
    const { fixture, panel, pos } = await render();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();

    panel.confirmDeactivate(category);
    expect(panel.deactivateData()).toMatchObject({
      entityName: 'Beverages',
      relatedCount: 8,
    });
    await panel.executeDeactivate();

    expect(pos.upsertCategory).toHaveBeenCalledWith({
      name: 'Beverages',
      slug: 'beverages',
      category_id: 'category-1',
      active: false,
    });
    expect(fixture.componentInstance.changed?.message).toBe('Beverages deactivated');
  });
});
