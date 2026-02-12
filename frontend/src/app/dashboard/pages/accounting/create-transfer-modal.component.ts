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
import { JournalEntry, LedgerService } from '../../../core/services/ledger/ledger.service';

/**
 * Create Transfer Modal
 *
 * Creates an inter-account transfer: debit from, credit to (and optional fee expense).
 * Uses eligible debit accounts for both from and to. Validates from ≠ to.
 */
@Component({
  selector: 'app-create-transfer-modal',
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
          <h3 class="text-lg font-bold text-base-content">Create transfer</h3>
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

        @if (successEntry()) {
          <div class="alert alert-success mb-4">
            <span class="font-semibold">Transfer created.</span>
            <span class="text-xs mt-1">Entry: {{ successEntry()!.id }}</span>
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
              <span>Open a session to create transfers (Dashboard → Open shift).</span>
            </div>
          }

          <form (ngSubmit)="onSubmit()" class="space-y-4">
            <div class="form-control">
              <label class="label" for="fromAccount">
                <span class="label-text font-semibold">From account</span>
              </label>
              <select
                id="fromAccount"
                [value]="fromAccountCode()"
                (change)="fromAccountCode.set($any($event.target).value)"
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
                  >Account to debit (money leaves this account).</span
                >
              </label>
            </div>

            <div class="form-control">
              <label class="label" for="toAccount">
                <span class="label-text font-semibold">To account</span>
              </label>
              <select
                id="toAccount"
                [value]="toAccountCode()"
                (change)="toAccountCode.set($any($event.target).value)"
                class="select select-bordered w-full"
                [class.select-error]="
                  fromAccountCode().trim() &&
                  toAccountCode().trim() &&
                  fromAccountCode().trim() === toAccountCode().trim()
                "
                [disabled]="isProcessing() || isLoadingAccounts()"
              >
                <option value="">Select account</option>
                @for (acc of eligibleAccounts(); track acc.code) {
                  <option [value]="acc.code">{{ acc.name }} ({{ acc.code }})</option>
                }
              </select>
              <label class="label">
                @if (
                  fromAccountCode().trim() &&
                  toAccountCode().trim() &&
                  fromAccountCode().trim() === toAccountCode().trim()
                ) {
                  <span class="label-text-alt text-error font-medium"
                    >From and to accounts must be different.</span
                  >
                } @else {
                  <span class="label-text-alt text-base-content/60"
                    >Account to credit (money goes to this account).</span
                  >
                }
              </label>
            </div>

            <div class="form-control">
              <label class="label" for="transferAmount">
                <span class="label-text font-semibold">Amount</span>
                <span class="label-text-alt text-base-content/60">KES</span>
              </label>
              <input
                id="transferAmount"
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
              <label class="label" for="entryDate">
                <span class="label-text font-semibold">Entry date</span>
              </label>
              <input
                id="entryDate"
                type="date"
                [value]="entryDate()"
                (input)="entryDate.set($any($event.target).value)"
                class="input input-bordered w-full"
                [disabled]="isProcessing()"
              />
            </div>

            <div class="form-control">
              <label class="label" for="feeAmount">
                <span class="label-text font-semibold">Transaction fee</span>
                <span class="label-text-alt text-base-content/60">Optional, KES</span>
              </label>
              <input
                id="feeAmount"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                [value]="feeAmountInput()"
                (input)="feeAmountInput.set($any($event.target).value)"
                class="input input-bordered w-full"
                [disabled]="isProcessing()"
              />
            </div>

            @if (getEffectiveFeeCents() > 0) {
              <div class="form-control">
                <label class="label" for="expenseTag">
                  <span class="label-text font-semibold">Expense tag (for fee)</span>
                </label>
                <input
                  id="expenseTag"
                  type="text"
                  placeholder="transaction_fee"
                  [value]="expenseTag()"
                  (input)="expenseTag.set($any($event.target).value)"
                  class="input input-bordered w-full"
                  [disabled]="isProcessing()"
                />
              </div>
            }

            <div class="form-control">
              <label class="label" for="transferMemo">
                <span class="label-text font-semibold">Memo</span>
                <span class="label-text-alt text-base-content/60">Optional</span>
              </label>
              <textarea
                id="transferMemo"
                placeholder="e.g. Till reconciliation"
                [value]="memo()"
                (input)="memo.set($any($event.target).value)"
                class="textarea textarea-bordered w-full min-h-16"
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
                  !fromAccountCode().trim() ||
                  !toAccountCode().trim() ||
                  fromAccountCode().trim() === toAccountCode().trim() ||
                  getEffectiveFeeCents() < 0
                "
              >
                {{ isProcessing() ? 'Processing...' : 'Create transfer' }}
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
export class CreateTransferModalComponent {
  private readonly ledgerService = inject(LedgerService);
  readonly currencyService = inject(CurrencyService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);

  readonly transferred = output<void>();
  readonly cancelled = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly amountInput = signal('');
  readonly feeAmountInput = signal('');
  readonly fromAccountCode = signal('');
  readonly toAccountCode = signal('');
  readonly entryDate = signal('');
  readonly expenseTag = signal('transaction_fee');
  readonly memo = signal('');
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);
  readonly isLoadingAccounts = signal(false);
  readonly successEntry = signal<JournalEntry | null>(null);

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

  getEffectiveFeeCents(): number {
    const raw = this.feeAmountInput().trim().replace(/,/g, '');
    if (!raw) return 0;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed < 0) return -1;
    return Math.round(parsed * 100);
  }

  onBackdropClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target?.tagName === 'DIALOG') (target as HTMLDialogElement).close();
  }

  async show(): Promise<void> {
    this.error.set(null);
    this.successEntry.set(null);
    this.isProcessing.set(false);
    this.amountInput.set('');
    this.feeAmountInput.set('');
    this.fromAccountCode.set('');
    this.toAccountCode.set('');
    this.memo.set('');
    this.expenseTag.set('transaction_fee');
    const today = new Date().toISOString().slice(0, 10);
    this.entryDate.set(today);

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
    const feeCents = this.getEffectiveFeeCents();
    const from = this.fromAccountCode()?.trim();
    const to = this.toAccountCode()?.trim();

    if (amountCents <= 0) {
      this.error.set('Enter a valid amount.');
      return;
    }
    if (!from || !to) {
      this.error.set('Select both from and to accounts.');
      return;
    }
    if (from === to) {
      this.error.set('From and to accounts must be different.');
      return;
    }
    if (feeCents < 0) {
      this.error.set('Fee cannot be negative.');
      return;
    }

    const companyId = this.companyService.activeCompanyId();
    if (!companyId) {
      this.error.set('No company selected.');
      return;
    }
    const channelId = parseInt(companyId, 10);
    if (Number.isNaN(channelId)) {
      this.error.set('Invalid company.');
      return;
    }

    const entryDateVal = this.entryDate() || new Date().toISOString().slice(0, 10);

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const entry = await this.ledgerService.createInterAccountTransfer({
        channelId,
        fromAccountCode: from,
        toAccountCode: to,
        amount: amountCents,
        entryDate: entryDateVal,
        memo: this.memo()?.trim() || undefined,
        feeAmount: feeCents > 0 ? feeCents : undefined,
        expenseTag: feeCents > 0 ? this.expenseTag()?.trim() || 'transaction_fee' : undefined,
      });
      this.successEntry.set(entry);
      setTimeout(() => {
        this.transferred.emit();
        this.hide();
      }, 1500);
    } catch (err: unknown) {
      const message =
        err && typeof (err as Error).message === 'string'
          ? (err as Error).message
          : 'Failed to create transfer.';
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
    this.transferred.emit();
  }
}
