import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PurchaseDraft } from '../../../../core/services/purchase.service.types';

/**
 * Purchase Form Fields Component
 *
 * Handles purchase metadata: date, reference number, notes.
 * Payment status is handled by PurchasePaymentSectionComponent.
 */
@Component({
  selector: 'app-purchase-form-fields',
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <!-- Purchase Date -->
      <div class="form-control">
        <label class="label py-1">
          <span class="label-text text-sm font-semibold">Purchase Date</span>
        </label>
        <input
          type="date"
          class="input input-bordered input-sm w-full"
          [value]="formatDateForInput(draft().purchaseDate)"
          (change)="onDateChange($any($event.target).value)"
        />
      </div>

      <!-- Reference Number -->
      <div class="form-control">
        <label class="label py-1">
          <span class="label-text text-sm font-semibold">Invoice / Reference</span>
        </label>
        <input
          type="text"
          class="input input-bordered input-sm w-full"
          placeholder="Invoice or reference number"
          [value]="draft().referenceNumber"
          (input)="onFieldChange('referenceNumber', $any($event.target).value)"
        />
      </div>
    </div>

    <!-- Notes -->
    <div class="form-control mt-3">
      <label class="label py-1">
        <span class="label-text text-sm font-semibold">Notes</span>
      </label>
      <textarea
        class="textarea textarea-bordered textarea-sm"
        rows="2"
        placeholder="Additional notes (optional)"
        [value]="draft().notes"
        (input)="onFieldChange('notes', $any($event.target).value)"
      ></textarea>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseFormFieldsComponent {
  readonly draft = input.required<PurchaseDraft>();
  readonly fieldChange = output<{ field: keyof PurchaseDraft; value: any }>();

  onFieldChange(field: keyof PurchaseDraft, value: any): void {
    this.fieldChange.emit({ field, value });
  }

  onDateChange(dateString: string): void {
    const date = new Date(dateString);
    this.onFieldChange('purchaseDate', date);
  }

  formatDateForInput(date: Date): string {
    return new Date(date).toISOString().split('T')[0];
  }
}
