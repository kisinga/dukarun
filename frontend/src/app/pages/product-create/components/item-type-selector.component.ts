import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ItemType } from '../types/product-creation.types';

/**
 * Item Type Selector Component
 *
 * Clean segment control for product vs service.
 */
@Component({
  selector: 'app-item-type-selector',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs tabs-lift w-full [--tab-bg:var(--color-base-300)] lg:bg-base-200 lg:p-1 lg:rounded-xl">
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
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="m7.5 4.27 9 5.15M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <path d="M3.29 7 12 12l8.71-5M12 22V12"/>
        </svg>
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
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
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
