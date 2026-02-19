import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CashierSessionService } from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { EXPENSE_CATEGORIES } from '../../../core/constants/expense-categories';
import {
  ExpenseService,
  RecordExpenseResult,
} from '../../../core/services/expense/expense.service';
import { LedgerService } from '../../../core/services/ledger/ledger.service';

/**
 * Record Expense Modal
 *
 * Records an expense: debit source account (e.g. Cash), credit expense account.
 * Uses same eligible debit accounts as pay-from for consistency.
 */
@Component({
  selector: 'app-record-expense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <h3 class="text-lg font-bold text-base-content">Record expense</h3>
          <form method="dialog">
            <button
              type="submit"
              class="btn btn-sm btn-circle btn-ghost"
              [disabled]="isProcessing()"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </form>
        </div>

        @if (successResult()) {
          <div class="alert alert-success mb-4">
            <span class="font-semibold">Expense recorded.</span>
            <span class="text-xs mt-1">Journal entry: {{ successResult()!.sourceId }}</span>
          </div>
          <div class="modal-action pt-4">
            <button type="button" class="btn btn-primary w-full" (click)="onClose()">Close</button>
          </div>
        } @else {
          @if (error()) {
            <div class="alert alert-error mb-4">
              <span class="text-sm">{{ error() }}</span>
            </div>
          }

          @if (!cashierSessionService.hasActiveSession()) {
            <div class="alert alert-warning mb-4">
              <span>Open a session to record expenses (Dashboard → Open shift).</span>
            </div>
          }

          <form (ngSubmit)="onSubmit()" class="space-y-4">
            <div class="form-control">
              <label class="label" for="expenseAmount">
                <span class="label-text font-semibold">Amount</span>
              </label>
              <input
                id="expenseAmount"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                [value]="amountInput()"
                (input)="amountInput.set($any($event.target).value)"
                class="input input-bordered w-full"
                [disabled]="isProcessing()"
              />
            </div>

            <div class="form-control">
              <label class="label" for="sourceAccount">
                <span class="label-text font-semibold">Source account (pay from)</span>
              </label>
              <select
                id="sourceAccount"
                [value]="selectedAccountCode()"
                (change)="selectedAccountCode.set($any($event.target).value)"
                class="select select-bordered w-full"
                [disabled]="isProcessing() || isLoadingAccounts()"
              >
                <option value="">Select account</option>
                @for (acc of eligibleAccounts(); track acc.code) {
                  <option [value]="acc.code">{{ acc.name }} ({{ acc.code }})</option>
                }
              </select>
              <label class="label">
                <span class="label-text-alt text-base-content/60"
                  >Account to debit (e.g. Cash, M-Pesa).</span
                >
              </label>
            </div>

            <div class="form-control">
              <label class="label" for="expenseCategory">
                <span class="label-text font-semibold">Category</span>
              </label>
              <select
                id="expenseCategory"
                [value]="category()"
                (change)="category.set($any($event.target).value)"
                class="select select-bordered w-full"
                [disabled]="isProcessing()"
              >
                @for (cat of expenseCategories; track cat.code) {
                  <option [value]="cat.code">{{ cat.label }}</option>
                }
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="expenseMemo">
                <span class="label-text font-semibold">Memo</span>
                <span class="label-text-alt text-base-content/60">Optional</span>
              </label>
              <textarea
                id="expenseMemo"
                placeholder="e.g. Office supplies"
                [value]="memo()"
                (input)="memo.set($any($event.target).value)"
                class="textarea textarea-bordered w-full min-h-20"
                [disabled]="isProcessing()"
              ></textarea>
            </div>

            @if (isProcessing()) {
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-lg"></span>
                <span class="ml-2 text-sm text-base-content/60">Processing...</span>
              </div>
            }

            <div class="modal-action pt-4 flex-col gap-2">
              <button
                type="submit"
                class="btn btn-primary w-full"
                [class.loading]="isProcessing()"
                [disabled]="
                  isProcessing() ||
                  !cashierSessionService.hasActiveSession() ||
                  getEffectiveAmountCents() <= 0 ||
                  !selectedAccountCode().trim()
                "
              >
                {{ isProcessing() ? 'Processing...' : 'Record expense' }}
              </button>
              <button
                type="button"
                class="btn btn-ghost w-full"
                (click)="onCancel()"
                [disabled]="isProcessing()"
              >
                Cancel
              </button>
            </div>
          </form>
        }
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class RecordExpenseModalComponent {
  private readonly expenseService = inject(ExpenseService);
  readonly currencyService = inject(CurrencyService);
  private readonly ledgerService = inject(LedgerService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);

  readonly recorded = output<void>();
  readonly cancelled = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly amountInput = signal('');
  readonly selectedAccountCode = signal('');
  readonly category = signal('other');
  readonly memo = signal('');
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);
  protected readonly expenseCategories = EXPENSE_CATEGORIES;
  readonly isLoadingAccounts = signal(false);
  readonly successResult = signal<RecordExpenseResult | null>(null);

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents);
  }

  getEffectiveAmountCents(): number {
    const raw = this.amountInput().trim().replace(/,/g, '');
    if (!raw) return 0;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }

  onBackdropClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target?.tagName === 'DIALOG') (target as HTMLDialogElement).close();
  }

  async show(): Promise<void> {
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    this.amountInput.set('');
    this.selectedAccountCode.set('');
    this.category.set('other');
    this.memo.set('');

    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        await firstValueFrom(this.cashierSessionService.getCurrentSession(channelId));
      }
    }

    this.isLoadingAccounts.set(true);
    try {
      const items = await firstValueFrom(this.ledgerService.loadEligibleDebitAccounts());
      this.eligibleAccounts.set(items.map((a) => ({ code: a.code, name: a.name })));
    } catch {
      this.eligibleAccounts.set([]);
    } finally {
      this.isLoadingAccounts.set(false);
    }

    this.modalRef()?.nativeElement?.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement?.close();
  }

  async onSubmit(): Promise<void> {
    const amountCents = this.getEffectiveAmountCents();
    const sourceCode = this.selectedAccountCode()?.trim();

    if (amountCents <= 0) {
      this.error.set('Enter a valid amount.');
      return;
    }
    if (!sourceCode) {
      this.error.set('Select a source account.');
      return;
    }

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const result = await this.expenseService.recordExpense(
        amountCents,
        sourceCode,
        this.memo()?.trim() || undefined,
        this.category() || 'other',
      );

      if (result) {
        this.successResult.set(result);
        setTimeout(() => {
          this.recorded.emit();
          this.hide();
        }, 1500);
      } else {
        this.error.set('Failed to record expense. Please try again.');
      }
    } catch (err: unknown) {
      const message =
        err && typeof (err as any).message === 'string'
          ? (err as any).message
          : 'Failed to record expense.';
      this.error.set(message);
    } finally {
      this.isProcessing.set(false);
    }
  }

  onCancel(): void {
    this.hide();
    this.cancelled.emit();
  }

  onClose(): void {
    this.hide();
    this.recorded.emit();
  }
}
