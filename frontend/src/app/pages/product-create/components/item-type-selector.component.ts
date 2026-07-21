import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ItemType } from '../types/product-creation.types';

/**
 * Item Type Selector Component
 *
 * Clean segment control for product vs service.
 */
@Component({
  selector: 'app-item-type-selector',
  imports: [CommonModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="tabs tabs-lift w-full [--tab-bg:var(--color-base-300)] lg:bg-base-200 lg:p-1 lg:rounded-xl"
    >
      <label
        class="tab flex-1 gap-2 font-medium"
        [class.tab-active]="itemType() === 'product'"
        [class.text-primary]="itemType() === 'product'"
      >
        <input
          type="radio"
          name="item_type_tabs"
          class="hidden"
          [checked]="itemType() === 'product'"
          (change)="onItemTypeChange('product')"
        />
        <ng-icon name="heroCube" size="1rem" />
        Product
      </label>
      <div class="tab-content bg-base-100 border-base-300 p-3 text-xs text-base-content/60">
        Physical items with tracked inventory
      </div>

      <label
        class="tab flex-1 gap-2 font-medium"
        [class.tab-active]="itemType() === 'service'"
        [class.text-primary]="itemType() === 'service'"
      >
        <input
          type="radio"
          name="item_type_tabs"
          class="hidden"
          [checked]="itemType() === 'service'"
          (change)="onItemTypeChange('service')"
        />
        <ng-icon name="heroWrenchScrewdriver" size="1rem" />
        Service
      </label>
      <div class="tab-content bg-base-100 border-base-300 p-3 text-xs text-base-content/60">
        Work or time-based offerings
      </div>
    </div>
  `,
})
export class ItemTypeSelectorComponent {
  // Inputs
  readonly itemType = input.required<ItemType>();

  // Outputs
  readonly itemTypeChange = output<ItemType>();

  /**
   * Handle item type selection
   */
  onItemTypeChange(type: ItemType): void {
    this.itemTypeChange.emit(type);
  }
}
