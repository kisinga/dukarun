import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../../core/money';
import { JournalListComponent } from '../journal-list.component';
import { JournalEntryWithLines, LedgerAccount, MoneyService } from '../money.service';

@Component({
  selector: 'app-money-expenses',
  imports: [RouterLink, ReactiveFormsModule, JournalListComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Expenses</h1>
          <button class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </header>

        <div class="card mb-4 bg-base-100 shadow">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Record expense</h2>
            <form (ngSubmit)="submit()" class="mt-2 grid gap-3 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text">Paid from</span>
                <select class="select select-bordered select-sm" [formControl]="account">
                  @for (a of accounts(); track a.code) {
                    <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                  }
                </select>
              </label>
              <label class="form-control">
                <span class="label-text">Amount (KES)</span>
                <input
                  type="text"
                  inputmode="decimal"
                  class="input input-bordered input-sm"
                  placeholder="0.00"
                  [formControl]="amount"
                />
              </label>
              <label class="form-control">
                <span class="label-text">Category</span>
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="e.g. Rent, Transport"
                  [formControl]="category"
                />
              </label>
              <label class="form-control">
                <span class="label-text">Memo</span>
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="Optional note"
                  [formControl]="memo"
                />
              </label>
              <div class="sm:col-span-2">
                <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">
                  {{ busy() ? 'Posting…' : 'Post expense' }}
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

        <h2 class="mb-2 text-lg font-semibold">Recent expenses</h2>
        <app-journal-list [entries]="entries()" emptyText="No expenses posted yet." />
      </div>
    </main>
  `,
})
export class MoneyExpensesComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly account = new FormControl('', { nonNullable: true });
  protected readonly amount = new FormControl('', { nonNullable: true });
  protected readonly category = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [accounts, entries] = await Promise.all([
        this.money.assetAccounts(),
        this.money.journalBySource('Expense'),
      ]);
      this.accounts.set(accounts);
      this.entries.set(entries);
      if (!this.account.value && accounts.length > 0) this.account.setValue(accounts[0].code);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  protected async submit(): Promise<void> {
    const cents = parseKesToCents(this.amount.value);
    if (cents === null || cents <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postExpense(
        cents,
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
