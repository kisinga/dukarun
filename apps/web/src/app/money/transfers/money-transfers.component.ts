import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { parseKes } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { JournalListComponent } from '../journal-list.component';
import { JournalEntryWithLines, LedgerAccount, MoneyService } from '../money.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-money-transfers',
  imports: [
    ReactiveFormsModule,
    JournalListComponent,
    FormFieldComponent,
    ButtonComponent,
    SessionRequiredNoticeComponent,
    IconComponent,
  ],
  template: `
    <div class="mb-3 flex items-start gap-3">
      <div>
        <h2 class="section-title">Transfers</h2>
        <p class="type-caption mt-1">Move money between controlled accounts with a clear trail.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        [loading]="loading()"
        type="button"
        title="Refresh transfers"
        aria-label="Refresh transfers"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
    </div>

    @if (!cashierSession.canTakePayment()) {
      <app-session-required-notice action="moving money between accounts" />
    }

    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">New transfer</h2>
        <form (submit)="$event.preventDefault(); submit()" class="grid gap-3 sm:grid-cols-2">
          <app-form-field label="From">
            <select class="select select-bordered select-sm w-full" [formControl]="from">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="To">
            <select class="select select-bordered select-sm w-full" [formControl]="to">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Principal (KES)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="principal"
            />
          </app-form-field>
          <app-form-field label="Fee (KES, optional)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="fee"
            />
          </app-form-field>
          <app-form-field label="Memo" class="sm:col-span-2">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="e.g. Bank the day's cash"
              [formControl]="memo"
            />
          </app-form-field>
          @if (sameAccount()) {
            <p class="text-sm text-warning sm:col-span-2">
              Source and destination are the same account.
            </p>
          }
          <div class="sm:col-span-2">
            <button
              appButton
              type="submit"
              [loading]="busy()"
              [disabled]="sameAccount() || !cashierSession.canTakePayment()"
            >
              Post transfer
            </button>
          </div>
        </form>
        @if (error()) {
          <p class="mt-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mt-2 text-sm text-success">{{ notice() }}</p>
        }
      </div>
    </div>

    <h2 class="section-title mb-2">Recent transfers</h2>
    <app-journal-list
      [entries]="entries()"
      [loading]="loading()"
      emptyText="No transfers posted yet."
    />
  `,
})
export class MoneyTransfersComponent implements OnInit {
  private readonly money = inject(MoneyService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  private readonly fromValue = toSignal(this.from.valueChanges, { initialValue: this.from.value });
  private readonly toValue = toSignal(this.to.valueChanges, { initialValue: this.to.value });
  protected readonly principal = new FormControl('', { nonNullable: true });
  protected readonly fee = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly sameAccount = computed(
    () => this.fromValue() !== '' && this.fromValue() === this.toValue()
  );

  /** Idempotency key for the in-progress transfer form (regenerated after success). */
  private transferId = crypto.randomUUID();

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [accounts, entries] = await Promise.all([
        this.money.transactableAccounts(),
        this.money.journalBySource('InterAccountTransfer'),
      ]);
      this.accounts.set(accounts);
      this.entries.set(entries);
      if (!this.from.value && accounts.length > 0) this.from.setValue(accounts[0].code);
      if (!this.to.value && accounts.length > 1) this.to.setValue(accounts[1].code);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    try {
      await this.cashierSession.assertOpen('moving money between accounts');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const principalAmount = parseKes(this.principal.value);
    if (principalAmount === null || principalAmount <= 0) {
      this.error.set('Enter a valid principal amount');
      return;
    }
    const feeAmount = this.fee.value.trim() ? parseKes(this.fee.value) : null;
    if (this.fee.value.trim() && (feeAmount === null || feeAmount < 0)) {
      this.error.set('Enter a valid fee amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postTransfer(
        this.from.value,
        this.to.value,
        principalAmount,
        feeAmount,
        this.transferId,
        this.memo.value.trim() || undefined
      );
      this.notice.set('Transfer posted');
      this.principal.setValue('');
      this.fee.setValue('');
      this.memo.setValue('');
      this.transferId = crypto.randomUUID();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post transfer');
    } finally {
      this.busy.set(false);
    }
  }
}
