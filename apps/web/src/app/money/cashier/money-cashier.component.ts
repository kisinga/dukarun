import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../../core/money';
import { CashierAccount, CashierSession, MoneyService, SessionWithCounts } from '../money.service';

@Component({
  selector: 'app-money-cashier',
  imports: [RouterLink, FormsModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Cashier Sessions" backLink="/dashboard" backLabel="Dashboard">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Current open session / open-close forms -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            @if (openSession(); as session) {
              <h2 class="card-title text-lg">Open session</h2>
              <p class="text-sm text-base-content/70">Opened {{ time(session.opened_at) }}</p>

              <h3 class="mt-4 font-semibold">Close session — blind count</h3>
              <p class="text-xs text-base-content/60">
                Count each drawer/account and enter what you actually have.
              </p>
              <div class="mt-2 flex flex-col gap-2">
                @for (account of accounts(); track account.account_code) {
                  <label class="form-control">
                    <span class="label-text">{{ account.label }} ({{ account.account_code }})</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      class="input input-bordered input-sm"
                      placeholder="0.00"
                      [(ngModel)]="declared[account.account_code]"
                    />
                  </label>
                }
                <button
                  class="btn btn-error btn-outline mt-2 self-start"
                  [disabled]="busy()"
                  (click)="closeSession(session.id)"
                >
                  {{ busy() ? 'Closing…' : 'Close session' }}
                </button>
              </div>
            } @else {
              <h2 class="card-title text-lg">No open session</h2>
              <p class="text-sm text-base-content/70">
                Declare the opening float per account to start a session.
              </p>
              <div class="mt-2 flex flex-col gap-2">
                @for (account of accounts(); track account.account_code) {
                  <label class="form-control">
                    <span class="label-text">{{ account.label }} ({{ account.account_code }})</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      class="input input-bordered input-sm"
                      placeholder="0.00"
                      [(ngModel)]="declared[account.account_code]"
                    />
                  </label>
                }
                <button
                  class="btn btn-primary mt-2 self-start"
                  [disabled]="busy() || accounts().length === 0"
                  (click)="openNewSession()"
                >
                  {{ busy() ? 'Opening…' : 'Open session' }}
                </button>
              </div>
            }
          </div>
        </div>

        <!-- Recent sessions -->
        <h2 class="mb-2 text-lg font-semibold">Recent sessions</h2>
        @if (sessions().length === 0) {
          <app-empty-state icon="heroBanknotes" title="No sessions yet." />
        } @else {
          <div class="flex flex-col gap-2">
            @for (session of sessions(); track session.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="text-sm font-semibold">{{ time(session.opened_at) }}</span>
                    <span
                      class="badge"
                      [class.badge-success]="session.status === 'open'"
                      [class.badge-outline]="session.status !== 'open'"
                    >
                      {{ session.status }}
                    </span>
                    @if (session.closed_at) {
                      <span class="text-xs text-base-content/60">
                        closed {{ time(session.closed_at) }}
                      </span>
                    }
                  </div>
                  @if (session.cash_drawer_counts.length > 0) {
                    <table class="table table-sm mt-2">
                      <thead>
                        <tr>
                          <th>Count</th>
                          <th>Declared</th>
                          <th>Expected</th>
                          <th class="text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (count of session.cash_drawer_counts; track count.id) {
                          <tr>
                            <td>{{ count.count_type }}</td>
                            <td>{{ fmt(count.declared_cash) }}</td>
                            <td>{{ fmt(count.expected_cash) }}</td>
                            <td
                              class="text-right font-semibold"
                              [class.text-error]="count.variance !== 0"
                            >
                              {{ fmt(count.variance) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </main>
  `,
})
export class MoneyCashierComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly fmt = formatKes;
  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly openSession = signal<CashierSession | null>(null);
  protected readonly sessions = signal<SessionWithCounts[]>([]);
  protected readonly declared: Record<string, string> = {};
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [accounts, open, sessions] = await Promise.all([
        this.money.cashierAccounts(),
        this.money.openSession(),
        this.money.recentSessions(),
      ]);
      this.accounts.set(accounts);
      this.openSession.set(open);
      this.sessions.set(sessions);
      // Pre-fill zeroes for any new account.
      for (const a of accounts) this.declared[a.account_code] ??= '0.00';
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }

  protected async openNewSession(): Promise<void> {
    await this.submit(decls => this.money.openCashierSession(decls), 'Session opened');
  }

  protected async closeSession(sessionId: string): Promise<void> {
    await this.submit(decls => this.money.closeCashierSession(sessionId, decls), 'Session closed');
  }

  private async submit(
    action: (decls: { account_code: string; declared: number }[]) => Promise<string>,
    successMessage: string
  ): Promise<void> {
    const decls: { account_code: string; declared: number }[] = [];
    for (const account of this.accounts()) {
      const cents = parseKesToCents(this.declared[account.account_code] ?? '');
      if (cents === null) {
        this.error.set(`Enter a valid amount for ${account.label}`);
        return;
      }
      decls.push({ account_code: account.account_code, declared: cents });
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action(decls);
      this.notice.set(successMessage);
      for (const a of this.accounts()) this.declared[a.account_code] = '0.00';
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Request failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
