import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StockAdjustmentDraft } from '../../../../core/services/stock-adjustment.service.types';

/**
 * Adjustment reasons
 */
export const ADJUSTMENT_REASONS = [
  { value: 'damage', label: 'Damage' },
  { value: 'loss', label: 'Loss/Theft' },
  { value: 'found', label: 'Found' },
  { value: 'correction', label: 'Correction' },
  { value: 'expired', label: 'Expired' },
  { value: 'return', label: 'Return from Customer' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Stock Adjustment Form Fields Component
 *
 * Handles reason selection and notes input for stock adjustments.
 */
@Component({
  selector: 'app-stock-adjustment-form-fields',
  imports: [CommonModule],
  template: `
    <div class="card bg-base-100 shadow">
      <div class="card-body p-4 sm:p-6 space-y-4">
        <h2 class="text-lg font-semibold">Adjustment Details</h2>

        <!-- Reason -->
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Reason *</span>
          </label>
          <select
            class="select select-bordered w-full"
            [value]="draft().reason"
            (change)="onReasonChange($any($event.target).value)"
          >
            <option value="">Select reason...</option>
            @for (reason of reasons; track reason.value) {
              <option [value]="reason.value">{{ reason.label }}</option>
            }
          </select>
        </div>

        <!-- Notes -->
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Notes</span>
          </label>
          <textarea
            class="textarea textarea-bordered w-full"
            placeholder="Additional notes (optional)"
            rows="3"
            [value]="draft().notes || ''"
            (input)="onNotesChange($any($event.target).value)"
          ></textarea>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAdjustmentFormFieldsComponent {
  readonly draft = input.required<StockAdjustmentDraft>();
  readonly reasons = ADJUSTMENT_REASONS;

  readonly reasonChange = output<string>();
  readonly notesChange = output<string>();

  onReasonChange(value: string): void {
    this.reasonChange.emit(value);
  }

  onNotesChange(value: string): void {
    this.notesChange.emit(value);
  }
}
