import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PurchaseDraft } from '../../../../core/services/purchase.service.types';

@Component({
  selector: 'app-purchase-payment-section',
  imports: [CommonModule],
  template: `
    <!-- Payment Status -->
    <div class="form-control">
      <label class="label">
        <span class="label-text font-semibold">Payment Status</span>
      </label>
      <div class="flex gap-2">
        @for (opt of statusOptions; track opt.value) {
          <button
            type="button"
            class="btn btn-sm flex-1"
            [class.btn-primary]="paymentStatus() === opt.value"
            [class.btn-outline]="paymentStatus() !== opt.value"
            (click)="onStatusChange(opt.value)"
          >
            {{ opt.label }}
          </button>
        }
      </div>
    </div>

    @if (paymentStatus() !== 'pending') {
      <div class="mt-3 space-y-3 p-3 bg-base-200 rounded-lg">
        <!-- Amount (only for partial) -->
        @if (paymentStatus() === 'partial') {
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-sm">Amount Paid</span>
              <span class="label-text-alt text-xs opacity-60">
                of {{ formatCurrency(totalCost()) }}
              </span>
            </label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              placeholder="Enter amount paid"
              step="0.01"
              min="0.01"
              [max]="totalCost()"
              [value]="paymentAmount() ?? ''"
              (input)="onFieldChange('paymentAmount', parseNum($any($event.target).value))"
            />
          </div>
        }

        <!-- Payment Source -->
        <div class="form-control">
          <label class="label py-1">
            <span class="label-text text-sm">Payment Source</span>
          </label>
          <select
            class="select select-bordered select-sm w-full"
            [value]="paymentAccountCode()"
            (change)="onFieldChange('paymentAccountCode', $any($event.target).value)"
          >
            <option value="">Default (Cash)</option>
            @for (acc of eligibleAccounts(); track acc.code) {
              <option [value]="acc.code">{{ acc.name }}</option>
            }
          </select>
        </div>

        <!-- Payment Reference -->
        <div class="form-control">
          <label class="label py-1">
            <span class="label-text text-sm">Payment Reference</span>
          </label>
          <input
            type="text"
            class="input input-bordered input-sm w-full"
            placeholder="M-Pesa code, bank ref, receipt #"
            [value]="paymentReference()"
            (input)="onFieldChange('paymentReference', $any($event.target).value)"
          />
        </div>

        <!-- Summary -->
        @if (paymentStatus() === 'partial' && paymentAmount() != null && paymentAmount()! > 0) {
          <div class="text-xs opacity-70 pt-1">
            Remaining balance: {{ formatCurrency(totalCost() - paymentAmount()!) }}
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasePaymentSectionComponent {
  readonly paymentStatus = input.required<'paid' | 'pending' | 'partial'>();
  readonly paymentAmount = input.required<number | null>();
  readonly paymentAccountCode = input.required<string>();
  readonly paymentReference = input.required<string>();
  readonly eligibleAccounts = input.required<{ code: string; name: string }[]>();
  readonly totalCost = input.required<number>();

  readonly fieldChange = output<{ field: keyof PurchaseDraft; value: any }>();

  readonly statusOptions = [
    { value: 'pending' as const, label: 'Not Paid' },
    { value: 'partial' as const, label: 'Partial' },
    { value: 'paid' as const, label: 'Paid' },
  ];

  onStatusChange(status: 'paid' | 'pending' | 'partial'): void {
    this.fieldChange.emit({ field: 'paymentStatus', value: status });
    // Clear payment amount when switching away from partial
    if (status !== 'partial') {
      this.fieldChange.emit({ field: 'paymentAmount', value: null });
    }
  }

  onFieldChange(field: keyof PurchaseDraft, value: any): void {
    this.fieldChange.emit({ field, value });
  }

  parseNum(value: string): number | null {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
