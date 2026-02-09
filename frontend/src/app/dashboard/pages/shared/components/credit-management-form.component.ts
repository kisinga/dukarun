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
    <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
      <div class="card-body p-5">
        <h2 class="text-lg font-semibold mb-1">Credit Management</h2>
        <p class="text-sm text-base-content/70 mb-4">
          Configure credit approval, limits, and duration
        </p>

        @if (!hasPermission()) {
          <div class="alert alert-info">
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
          <div class="space-y-4">
            <!-- Credit Approval Status -->
            <div class="form-control">
              <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                <div class="flex-1 pr-3">
                  <div class="font-semibold text-sm">Credit Approval</div>
                  <div class="text-xs text-base-content/70 mt-0.5">Allow credit purchases</div>
                </div>
                <input
                  type="checkbox"
                  class="toggle toggle-primary"
                  [checked]="isCreditApproved()"
                  (change)="onCreditApprovalChange($any($event.target).checked)"
                  [disabled]="!hasPermission() || isReadonly()"
                />
              </div>
            </div>

            <!-- Credit Limit -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Credit Limit</span>
                @if (hasPermission() && !isReadonly()) {
                  <span class="label-text-alt">Optional</span>
                }
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                class="input input-bordered w-full"
                [class.input-disabled]="!hasPermission() || isReadonly()"
                [value]="creditLimitInDisplayUnits()"
                (input)="onCreditLimitChange($any($event.target).valueAsNumber || 0)"
                [disabled]="!hasPermission() || isReadonly()"
                placeholder="Enter credit limit"
              />
              @if (creditLimit() > 0 && hasPermission()) {
                <div class="text-xs text-base-content/60 mt-1">
                  {{ currencyService.format(creditLimit()) }}
                </div>
              }
            </div>

            <!-- Credit Duration -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Credit Duration</span>
                @if (hasPermission() && !isReadonly()) {
                  <span class="label-text-alt">Days (default: 30)</span>
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

            <!-- Credit Summary -->
            @if (showSummary()) {
              <div class="divider my-2"></div>
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
                    {{ currencyService.format(isCreditApproved() ? creditLimit() : 0) }}
                  </div>
                </div>
              </div>
            }
          </div>
        }
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

  // Internal state - creditLimit stored in cents
  readonly creditLimit = signal(this.initialCreditLimit());
  readonly creditDuration = signal(this.initialCreditDuration());
  readonly isCreditApproved = signal(this.initialIsCreditApproved());

  /** Credit limit in display units (sh) for input field */
  readonly creditLimitInDisplayUnits = computed(() => this.creditLimit() / 100);

  // Outputs
  readonly creditChange = output<{
    creditLimit: number;
    creditDuration: number;
    isCreditApproved: boolean;
  }>();

  onCreditApprovalChange(approved: boolean): void {
    this.isCreditApproved.set(approved);
    this.emitChange();
  }

  onCreditLimitChange(limitInDisplayUnits: number): void {
    const cents = Math.round(Math.max(0, limitInDisplayUnits) * 100);
    this.creditLimit.set(cents);
    this.emitChange();
  }

  onCreditDurationChange(duration: number): void {
    this.creditDuration.set(Math.max(1, duration));
    this.emitChange();
  }

  private emitChange(): void {
    this.creditChange.emit({
      creditLimit: this.creditLimit(), // Emit cents
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
