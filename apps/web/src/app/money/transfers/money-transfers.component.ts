import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { parseKesToCents } from '../../core/money';
import { JournalListComponent } from '../journal-list.component';
import { JournalEntryWithLines, LedgerAccount, MoneyService } from '../money.service';

@Component({
  selector: 'app-money-transfers',
  imports: [RouterLink, ReactiveFormsModule, JournalListComponent, PageHeaderComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Transfers" backLink="/dashboard" backLabel="Dashboard">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">New transfer</h2>
            <form
              (submit)="$event.preventDefault(); submit()"
              class="mt-2 grid gap-3 sm:grid-cols-2"
            >
              <label class="form-control">
                <span class="label-text">From</span>
                <select class="select select-bordered select-sm" [formControl]="from">
                  @for (a of accounts(); track a.code) {
                    <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                  }
                </select>
              </label>
              <label class="form-control">
                <span class="label-text">To</span>
                <select class="select select-bordered select-sm" [formControl]="to">
                  @for (a of accounts(); track a.code) {
                    <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                  }
                </select>
              </label>
              <label class="form-control">
                <span class="label-text">Principal (KES)</span>
                <input
                  type="text"
                  inputmode="decimal"
                  class="input input-bordered input-sm"
                  placeholder="0.00"
                  [formControl]="principal"
                />
              </label>
              <label class="form-control">
                <span class="label-text">Fee (KES, optional)</span>
                <input
                  type="text"
                  inputmode="decimal"
                  class="input input-bordered input-sm"
                  placeholder="0.00"
                  [formControl]="fee"
                />
              </label>
              <label class="form-control sm:col-span-2">
                <span class="label-text">Memo</span>
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="e.g. Bank the day's cash"
                  [formControl]="memo"
                />
              </label>
              @if (sameAccount()) {
                <p class="text-sm text-warning sm:col-span-2">
                  Source and destination are the same account.
                </p>
              }
              <div class="sm:col-span-2">
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="busy() || sameAccount()"
                >
                  {{ busy() ? 'Posting…' : 'Post transfer' }}
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

        <h2 class="mb-2 text-lg font-semibold">Recent transfers</h2>
        <app-journal-list [entries]="entries()" emptyText="No transfers posted yet." />
      </div>
    </main>
  `,
})
export class MoneyTransfersComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly entries = signal<JournalEntryWithLines[]>([]);
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  private readonly fromValue = signal('');
  private readonly toValue = signal('');
  protected readonly principal = new FormControl('', { nonNullable: true });
  protected readonly fee = new FormControl('', { nonNullable: true });
  protected readonly memo = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly sameAccount = computed(
    () => this.fromValue() !== '' && this.fromValue() === this.toValue()
  );

  /** Idempotency key for the in-progress transfer form (regenerated after success). */
  private transferId = crypto.randomUUID();

  constructor() {
    this.from.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.fromValue.set(v));
    this.to.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.toValue.set(v));
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [accounts, entries] = await Promise.all([
        this.money.assetAccounts(),
        this.money.journalBySource('InterAccountTransfer'),
      ]);
      this.accounts.set(accounts);
      this.entries.set(entries);
      if (!this.from.value && accounts.length > 0) this.from.setValue(accounts[0].code);
      if (!this.to.value && accounts.length > 1) this.to.setValue(accounts[1].code);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  protected async submit(): Promise<void> {
    const principalCents = parseKesToCents(this.principal.value);
    if (principalCents === null || principalCents <= 0) {
      this.error.set('Enter a valid principal amount');
      return;
    }
    const feeCents = this.fee.value.trim() ? parseKesToCents(this.fee.value) : null;
    if (this.fee.value.trim() && (feeCents === null || feeCents < 0)) {
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
        principalCents,
        feeCents,
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
