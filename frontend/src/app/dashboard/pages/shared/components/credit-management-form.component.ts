import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Credit Management Form Component
 *
 * Reusable component for managing customer credit settings during creation or editing.
 * Supports permission-based field access and read-only mode.
 */
@Component({
  selector: 'app-credit-management-form',
  imports: [CommonModule],
  template: `
    <div class="collapse collapse-arrow bg-base-100 border border-base-300 shadow-sm">
      <input
        type="checkbox"
        [checked]="isExpanded()"
        (change)="isExpanded.set($any($event.target).checked)"
      />
      <div class="collapse-title text-lg font-semibold px-4 py-3">💳 Credit Management</div>
      <div class="collapse-content px-4 pb-4">
        @if (!hasPermission()) {
          <div class="alert alert-info mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-sm">Credit management requires appropriate permissions</span>
          </div>
        } @else {
          <p class="text-sm text-base-content/70 mb-4">
            Configure customer credit approval, limits, and duration
          </p>
        }

        <div class="space-y-4">
          <!-- Credit Approval Status -->
          <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
            <div class="flex-1 pr-3">
              <div class="font-semibold text-sm">Credit Approval</div>
              <div class="text-xs text-base-content/70 mt-0.5">
                Allow customer to make credit purchases
              </div>
            </div>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              [checked]="isCreditApproved()"
              (change)="onCreditApprovalChange($any($event.target).checked)"
              [disabled]="!hasPermission() || isReadonly()"
            />
          </div>

          <!-- Credit Limit -->
          <div class="space-y-2">
            <label class="label py-1">
              <span class="label-text font-semibold text-sm">Credit Limit</span>
              @if (hasPermission() && !isReadonly()) {
                <span class="label-text-alt text-xs">Optional</span>
              }
            </label>
            <div class="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                class="input input-bordered w-full"
                [class.input-disabled]="!hasPermission() || isReadonly()"
                [value]="creditLimit()"
                (input)="onCreditLimitChange($any($event.target).valueAsNumber || 0)"
                [disabled]="!hasPermission() || isReadonly()"
                placeholder="Enter credit limit"
              />
              @if (creditLimit() > 0 && hasPermission()) {
                <div class="text-xs text-base-content/60 mt-1">
                  {{ currencyService.format(creditLimit() * 100) }}
                </div>
              }
            </div>
          </div>

          <!-- Credit Duration -->
          <div class="space-y-2">
            <label class="label py-1">
              <span class="label-text font-semibold text-sm">Credit Duration</span>
              @if (hasPermission() && !isReadonly()) {
                <span class="label-text-alt text-xs">Days (default: 30)</span>
              }
            </label>
            <input
              type="number"
              min="1"
              class="input input-bordered w-full"
              [class.input-disabled]="!hasPermission() || isReadonly()"
              [value]="creditDuration()"
              (input)="onCreditDurationChange($any($event.target).valueAsNumber || 30)"
              [disabled]="!hasPermission() || isReadonly() || !isCreditApproved()"
              placeholder="30"
            />
          </div>

          <!-- Credit Summary (for display during creation) -->
          @if (showSummary()) {
            <div class="divider my-4"></div>
            <div class="grid grid-cols-2 gap-3">
              <div class="stat bg-base-200 rounded-lg p-3">
                <div class="stat-title text-xs">Outstanding</div>
                <div class="stat-value text-base text-warning">
                  {{ currencyService.format(0) }}
                </div>
              </div>
              <div class="stat bg-base-200 rounded-lg p-3">
                <div class="stat-title text-xs">Available</div>
                <div class="stat-value text-base text-success">
                  {{ currencyService.format((isCreditApproved() ? creditLimit() : 0) * 100) }}
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditManagementFormComponent {
  readonly currencyService = inject(CurrencyService);

  // Inputs
  readonly hasPermission = input<boolean>(false);
  readonly isReadonly = input<boolean>(false);
  readonly initialCreditLimit = input<number>(0);
  readonly initialCreditDuration = input<number>(30);
  readonly initialIsCreditApproved = input<boolean>(false);
  readonly showSummary = input<boolean>(true);
  readonly defaultExpanded = input<boolean>(false);

  // Internal state
  readonly isExpanded = signal(this.defaultExpanded());
  readonly creditLimit = signal(this.initialCreditLimit());
  readonly creditDuration = signal(this.initialCreditDuration());
  readonly isCreditApproved = signal(this.initialIsCreditApproved());

  // Outputs
  readonly creditChange = output<{
    creditLimit: number;
    creditDuration: number;
    isCreditApproved: boolean;
  }>();

  constructor() {
    // Initialize expanded state
    this.isExpanded.set(this.defaultExpanded());
  }

  onCreditApprovalChange(approved: boolean): void {
    this.isCreditApproved.set(approved);
    this.emitChange();
  }

  onCreditLimitChange(limit: number): void {
    this.creditLimit.set(Math.max(0, limit));
    this.emitChange();
  }

  onCreditDurationChange(duration: number): void {
    this.creditDuration.set(Math.max(1, duration));
    this.emitChange();
  }

  private emitChange(): void {
    this.creditChange.emit({
      creditLimit: this.creditLimit(),
      creditDuration: this.creditDuration(),
      isCreditApproved: this.isCreditApproved(),
    });
  }

  /**
   * Get current credit values (for parent component to read)
   */
  getValues(): { creditLimit: number; creditDuration: number; isCreditApproved: boolean } {
    return {
      creditLimit: this.creditLimit(),
      creditDuration: this.creditDuration(),
      isCreditApproved: this.isCreditApproved(),
    };
  }
}
