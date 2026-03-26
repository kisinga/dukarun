import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../../../core/services/apollo.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OVERRIDE_CUSTOMER_BALANCE } from '../../../../core/graphql/operations.graphql';

export interface BalanceOverrideModalData {
  customerId: string;
  customerName: string;
  currentBalance: number; // in cents
}

@Component({
  selector: 'app-balance-override-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle">
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-lg mb-1">Override Balance</h3>
        <p class="text-sm text-base-content/70 mb-4">
          Set a new balance for <span class="font-medium">{{ data()?.customerName }}</span
          >. A ledger adjustment entry will be posted.
        </p>

        @if (error()) {
          <div role="alert" class="alert alert-error mb-4 py-2">
            <span class="text-sm">{{ error() }}</span>
            <button class="btn btn-ghost btn-xs" (click)="error.set(null)">X</button>
          </div>
        }

        @if (successResult()) {
          <div role="alert" class="alert alert-success mb-4 py-2">
            <span class="text-sm">
              Balance adjusted from {{ formatCents(successResult()!.previousBalance) }} to
              {{ formatCents(successResult()!.newBalance) }} ({{
                formatCents(successResult()!.adjustmentAmount)
              }}
              adjustment)
            </span>
          </div>
        } @else {
          <div class="space-y-4">
            <div class="stat bg-base-200/50 rounded-lg p-3">
              <div class="stat-title text-xs">Current Balance</div>
              <div
                class="stat-value text-sm"
                [class.text-error]="(data()?.currentBalance ?? 0) > 0"
              >
                {{ formatCents(data()?.currentBalance ?? 0) }}
              </div>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">New Balance (in major currency units)</span>
              </label>
              <input
                type="number"
                class="input input-bordered"
                [ngModel]="targetBalanceMajor()"
                (ngModelChange)="targetBalanceMajor.set($event)"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
              <label class="label">
                <span class="label-text-alt text-base-content/50">
                  Enter 0 to clear the balance entirely
                </span>
              </label>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">Reason</span>
              </label>
              <textarea
                class="textarea textarea-bordered"
                rows="2"
                [ngModel]="reason()"
                (ngModelChange)="reason.set($event)"
                placeholder="Reason for balance adjustment (required)"
              ></textarea>
            </div>
          </div>

          <div class="modal-action">
            <button class="btn btn-ghost" (click)="hide()" [disabled]="isProcessing()">
              Cancel
            </button>
            <button
              class="btn btn-primary"
              [disabled]="!canSubmit() || isProcessing()"
              (click)="onConfirm()"
            >
              @if (isProcessing()) {
                <span class="loading loading-spinner loading-xs"></span>
                Adjusting...
              } @else {
                Confirm Override
              }
            </button>
          </div>
        }
      </div>
      <form method="dialog" class="modal-backdrop">
        <button (click)="hide()">close</button>
      </form>
    </dialog>
  `,
})
export class BalanceOverrideModalComponent {
  private readonly apollo = inject(ApolloService);
  private readonly currencyService = inject(CurrencyService);
  private readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly data = input<BalanceOverrideModalData | null>(null);
  readonly balanceOverridden = output<void>();
  readonly cancelled = output<void>();

  readonly targetBalanceMajor = signal<number>(0);
  readonly reason = signal<string>('');
  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly successResult = signal<{
    previousBalance: number;
    newBalance: number;
    adjustmentAmount: number;
  } | null>(null);

  readonly canSubmit = signal(true);

  show(): void {
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    // Pre-fill with current balance in major units
    const currentCents = this.data()?.currentBalance ?? 0;
    this.targetBalanceMajor.set(currentCents / 100);
    this.reason.set('');
    this.modalRef()?.nativeElement?.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement?.close();
    if (!this.successResult()) {
      this.cancelled.emit();
    }
  }

  formatCents(cents: number): string {
    return this.currencyService.format(cents ?? 0, false);
  }

  async onConfirm(): Promise<void> {
    const d = this.data();
    if (!d) return;

    const reasonText = this.reason().trim();
    if (!reasonText) {
      this.error.set('A reason is required.');
      return;
    }

    const targetCents = Math.round(this.targetBalanceMajor() * 100);
    if (targetCents < 0) {
      this.error.set('Balance cannot be negative.');
      return;
    }

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const client = this.apollo.getClient();
      const result = await client.mutate({
        mutation: OVERRIDE_CUSTOMER_BALANCE as import('graphql').DocumentNode,
        variables: {
          input: {
            customerId: d.customerId,
            targetBalance: targetCents,
            reason: reasonText,
          },
        },
      });

      const data = (result.data as any)?.overrideCustomerBalance;
      if (data) {
        this.successResult.set({
          previousBalance: data.previousBalance,
          newBalance: data.newBalance,
          adjustmentAmount: data.adjustmentAmount,
        });
        setTimeout(() => {
          this.balanceOverridden.emit();
          this.hide();
        }, 2000);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to override balance');
    } finally {
      this.isProcessing.set(false);
    }
  }
}
