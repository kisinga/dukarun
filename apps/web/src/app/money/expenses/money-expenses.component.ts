import { Component, OnInit, inject, signal } from '@angular/core';
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
  selector: 'app-money-expenses',
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
        <h2 class="section-title">Expenses</h2>
        <p class="type-caption mt-1">Record business spending and review recent postings.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        [loading]="loading()"
        type="button"
        title="Refresh expenses"
        aria-label="Refresh expenses"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
    </div>

    @if (!cashierSession.canTakePayment()) {
      <app-session-required-notice action="recording an expense" />
    }

    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Record expense</h2>
        <form (submit)="$event.preventDefault(); submit()" class="grid gap-3 sm:grid-cols-2">
          <app-form-field label="Paid from">
            <select class="select select-bordered select-sm w-full" [formControl]="account">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Amount (KES)">
            <input
              type="text"
              inputmode="numeric"
              class="input input-bordered input-sm w-full"
              placeholder="0"
              [formControl]="amount"
            />
          </app-form-field>
          <app-form-field label="Category">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="e.g. Rent, Transport"
              [formControl]="category"
            />
          </app-form-field>
          <app-form-field label="Memo">
            <input
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="Optional note"
              [formControl]="memo"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <button
              appButton
              type="submit"
              [loading]="busy()"
              [disabled]="!cashierSession.canTakePayment()"
            >
              Post expense
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

    <h2 class="section-title mb-2">Recent expenses</h2>
    <app-journal-list
      [entries]="entries()"
      [loading]="loading()"
      emptyText="No expenses posted yet."
    />
  `,
})
export class MoneyExpensesComponent implements OnInit {
  private readonly money = inject(MoneyService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly account = new FormControl('', { nonNullable: true });
  protected readonly amount = new FormControl('', { nonNullable: true });
  protected readonly category = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [accounts, entries] = await Promise.all([
        this.money.transactableAccounts(),
        this.money.journalBySource('Expense'),
      ]);
      this.accounts.set(accounts);
      this.entries.set(entries);
      if (!this.account.value && accounts.length > 0) this.account.setValue(accounts[0].code);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    try {
      await this.cashierSession.assertOpen('recording an expense');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const amount = parseKes(this.amount.value);
    if (amount === null || amount <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postExpense(
        amount,
        this.account.value,
        this.category.value.trim() || undefined,
        this.memo.value.trim() || undefined
      );
      this.notice.set('Expense posted');
      this.amount.setValue('');
      this.category.setValue('');
      this.memo.setValue('');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post expense');
    } finally {
      this.busy.set(false);
    }
  }
}
