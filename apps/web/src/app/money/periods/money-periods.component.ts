import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../../core/money';
import { AccountingPeriod, CashierAccount, MoneyService, PeriodLock } from '../money.service';

@Component({
  selector: 'app-money-periods',
  imports: [RouterLink, FormsModule, ReactiveFormsModule],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Reconciliation &amp; Periods</h1>
          <button class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        @if (lock(); as l) {
          <div class="alert alert-warning mb-4">
            <span
              >Books are locked through <strong>{{ l.lock_end_date }}</strong
              >.</span
            >
          </div>
        }

        <!-- Manual reconciliation -->
        <div class="card mb-4 bg-base-100 shadow">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Manual reconciliation</h2>
            <p class="text-xs text-base-content/60">
              Declare actual balances per cashier-controlled account (e.g. after checking the M-Pesa
              statement or the bank). A reason is required for accounts with variance.
            </p>
            <div class="mt-2 flex flex-col gap-2">
              @for (account of accounts(); track account.account_code) {
                <div class="flex flex-wrap items-end gap-2">
                  <label class="form-control w-48">
                    <span class="label-text text-xs">
                      {{ account.label }} ({{ account.account_code }})
                    </span>
                    <input
                      type="text"
                      inputmode="decimal"
                      class="input input-bordered input-sm"
                      placeholder="0.00"
                      [(ngModel)]="declared[account.account_code]"
                    />
                  </label>
                  <label class="form-control flex-1">
                    <span class="label-text text-xs">Reason (optional)</span>
                    <input
                      type="text"
                      class="input input-bordered input-sm"
                      [(ngModel)]="reasons[account.account_code]"
                    />
                  </label>
                </div>
              }
              <button
                class="btn btn-primary btn-sm mt-2 self-start"
                [disabled]="busy() || accounts().length === 0"
                (click)="reconcile()"
              >
                {{ busy() ? 'Recording…' : 'Record reconciliation' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Close period -->
        <div class="card mb-4 bg-base-100 shadow">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Close accounting period</h2>
            <p class="text-xs text-base-content/60">
              Closing locks all posting through the end date. The backend gates this on
              reconciliations and open sessions — its messages are shown verbatim.
            </p>
            <form (submit)="$event.preventDefault(); askClose()" class="mt-2 flex flex-wrap items-end gap-2">
              <label class="form-control">
                <span class="label-text text-xs">Period end date</span>
                <input type="date" class="input input-bordered input-sm" [formControl]="endDate" />
              </label>
              @if (confirmClose()) {
                <button type="submit" class="btn btn-error btn-sm" [disabled]="busy()">
                  {{ busy() ? 'Closing…' : 'Confirm close' }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  (click)="confirmClose.set(false)"
                >
                  Cancel
                </button>
              } @else {
                <button type="submit" class="btn btn-outline btn-sm">Close period</button>
              }
            </form>
          </div>
        </div>

        <!-- Periods list -->
        <h2 class="mb-2 text-lg font-semibold">Periods</h2>
        @if (periods().length === 0) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <p class="text-center text-base-content/60">No periods yet.</p>
            </div>
          </div>
        } @else {
          <div class="card bg-base-100 shadow">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (p of periods(); track p.id) {
                  <tr>
                    <td>{{ p.start_date }}</td>
                    <td>{{ p.end_date }}</td>
                    <td>
                      <span
                        class="badge"
                        [class.badge-success]="p.status === 'open'"
                        [class.badge-outline]="p.status !== 'open'"
                      >
                        {{ p.status }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </main>
  `,
})
export class MoneyPeriodsComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly lock = signal<PeriodLock | null>(null);
  protected readonly declared: Record<string, string> = {};
  protected readonly reasons: Record<string, string> = {};
  protected readonly endDate = new FormControl(this.yesterday(), { nonNullable: true });
  protected readonly confirmClose = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [accounts, periods, lock] = await Promise.all([
        this.money.cashierAccounts(),
        this.money.periods(),
        this.money.periodLock(),
      ]);
      this.accounts.set(accounts);
      this.periods.set(periods);
      this.lock.set(lock);
      for (const a of accounts) this.declared[a.account_code] ??= '';
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  protected async reconcile(): Promise<void> {
    const decls: { account_code: string; declared: number; reason?: string }[] = [];
    for (const account of this.accounts()) {
      const raw = this.declared[account.account_code]?.trim();
      if (!raw) continue; // skip untouched accounts
      const cents = parseKesToCents(raw);
      if (cents === null) {
        this.error.set(`Enter a valid amount for ${account.label}`);
        return;
      }
      const reason = this.reasons[account.account_code]?.trim();
      decls.push({
        account_code: account.account_code,
        declared: cents,
        ...(reason ? { reason } : {}),
      });
    }
    if (decls.length === 0) {
      this.error.set('Declare at least one account balance');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.recordManualReconciliation(decls);
      this.notice.set('Reconciliation recorded');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async askClose(): Promise<void> {
    if (!this.confirmClose()) {
      this.confirmClose.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.closeAccountingPeriod(this.endDate.value);
      this.notice.set(`Period closed through ${this.endDate.value}`);
      this.confirmClose.set(false);
      await this.load();
    } catch (err) {
      // Gate errors (reconciliation_required, open_sessions_exist, …) are
      // informative — show them verbatim.
      this.error.set(err instanceof Error ? err.message : 'Close failed');
    } finally {
      this.busy.set(false);
    }
  }

  private yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
