import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { parseKesToCents } from '../../core/money';
import {
  CashierAccount,
  CashierSession,
  MoneyService,
  ReconAccountWithParent,
  SessionWithCounts,
} from '../money.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { CashierSessionService } from '../../core/cashier-session.service';

@Component({
  selector: 'app-money-cashier',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="mb-3 flex items-center justify-end">
      <button appButton variant="ghost" (click)="load()">Refresh</button>
    </div>

    @if (error()) {
      <p class="mb-2 text-sm text-error">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="mb-2 text-sm text-success">{{ notice() }}</p>
    }
    @if (lastClosedSessionId(); as sid) {
      @if (printerEnabled()) {
        <button appButton variant="outline" class="mb-4 min-h-11" (click)="printSlip(sid)">
          Print cashier slip
        </button>
      }
    }

    <!-- Current open session / open-close forms -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        @if (openSession(); as session) {
          <h2 class="section-title mb-2">Open session</h2>
          <p class="text-sm text-base-content/70">Opened {{ time(session.opened_at) }}</p>

          <h3 class="mt-4 font-semibold">Close session — blind count</h3>
          <p class="text-xs text-base-content/60">
            This count is blind — you won't see the expected amount. Count what's actually in the
            drawer and enter it per account.
          </p>
          <div class="mt-2 flex flex-col gap-2">
            @for (account of accounts(); track account.account_code) {
              <app-form-field [label]="account.label + ' (' + account.account_code + ')'">
                <input
                  type="text"
                  inputmode="numeric"
                  class="input input-bordered input-sm w-full"
                  placeholder="0"
                  [(ngModel)]="declared[account.account_code]"
                />
              </app-form-field>
            }
            <button
              appButton
              variant="error"
              class="mt-2 self-start"
              [loading]="busy()"
              (click)="closeSession(session.id)"
            >
              Close session
            </button>
          </div>
        } @else {
          <h2 class="section-title mb-2">No open session</h2>
          <p class="text-sm text-base-content/70">
            Declare the opening float per account to start a session.
          </p>
          <div class="mt-2 flex flex-col gap-2">
            @for (account of accounts(); track account.account_code) {
              <app-form-field [label]="account.label + ' (' + account.account_code + ')'">
                <input
                  type="text"
                  inputmode="numeric"
                  class="input input-bordered input-sm w-full"
                  placeholder="0"
                  [(ngModel)]="declared[account.account_code]"
                />
              </app-form-field>
            }
            <button
              appButton
              size="md"
              class="mt-2 self-start"
              [loading]="busy()"
              [disabled]="accounts().length === 0"
              (click)="openNewSession()"
            >
              Open session
            </button>
          </div>
        }
      </div>
    </div>

    <!-- Recent sessions -->
    <h2 class="section-title mb-2">Recent sessions</h2>
    @if (sessions().length === 0) {
      <app-empty-state
        icon="heroBanknotes"
        title="No sessions yet"
        description="Open a session above to start counting the till."
      />
    } @else {
      <div class="flex flex-col gap-2">
        @for (session of sessions(); track session.id) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-sm font-semibold">{{ time(session.opened_at) }}</span>
                <app-status-badge type="neutral" [label]="session.status" />
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
                      <th class="text-right">Declared</th>
                      <th class="text-right">Expected</th>
                      <th class="text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (count of session.cash_drawer_counts; track count.id) {
                      <tr>
                        <td>{{ count.count_type }}</td>
                        <td class="text-right"><app-money [cents]="count.declared_cash" /></td>
                        <td class="text-right"><app-money [cents]="count.expected_cash" /></td>
                        <td
                          class="text-right font-semibold"
                          [class.text-error]="count.variance !== 0"
                        >
                          <app-money [cents]="count.variance" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
              @if (reconFor(session.id).length > 0) {
                <h3 class="type-heading mt-3">Variance review</h3>
                <div class="table-scroll">
                  <table class="table table-sm mt-1">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th class="text-right">Declared</th>
                        <th class="text-right">Expected</th>
                        <th class="text-right">Variance</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (ra of reconFor(session.id); track ra.id) {
                        <tr>
                          <td class="font-mono text-xs">{{ ra.account_code }}</td>
                          <td class="text-right"><app-money [cents]="ra.declared" /></td>
                          <td class="text-right"><app-money [cents]="ra.expected" /></td>
                          <td
                            class="text-right font-semibold"
                            [class.text-error]="ra.variance !== 0 && !ra.reviewed_at"
                          >
                            <app-money [cents]="ra.variance" />
                          </td>
                          <td class="text-right">
                            @if (ra.reviewed_at) {
                              <span class="type-caption">
                                Reviewed · User …{{ shortId(ra.reviewed_by) }} ·
                                {{ date(ra.reviewed_at) }}
                              </span>
                            } @else if (ra.variance !== 0) {
                              @if (revertingFor() === ra.id) {
                                <div class="flex items-center justify-end gap-1">
                                  <input
                                    type="text"
                                    class="input input-bordered input-xs w-36"
                                    placeholder="Reason (optional)"
                                    [formControl]="revertReason"
                                  />
                                  <button
                                    class="btn btn-warning btn-xs"
                                    [disabled]="busy()"
                                    (click)="confirmRevert(ra.id)"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    class="btn btn-ghost btn-xs"
                                    (click)="revertingFor.set(null)"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              } @else {
                                <button
                                  class="btn btn-warning btn-outline btn-xs"
                                  [disabled]="busy()"
                                  (click)="startRevert(ra.id)"
                                >
                                  Revert
                                </button>
                              }
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class MoneyCashierComponent implements OnInit {
  private readonly cashierSessionState = inject(CashierSessionService);
  private readonly money = inject(MoneyService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly openSession = signal<CashierSession | null>(null);
  protected readonly sessions = signal<SessionWithCounts[]>([]);
  protected readonly declared: Record<string, string> = {};
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly lastClosedSessionId = signal<string | null>(null);
  protected readonly reconAccounts = signal<ReconAccountWithParent[]>([]);
  protected readonly revertingFor = signal<string | null>(null);
  protected readonly revertReason = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
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
      this.reconAccounts.set(await this.money.sessionReconAccounts(sessions.map(x => x.id)));
      // Pre-fill zeroes for any new account.
      for (const a of accounts) this.declared[a.account_code] ??= '0';
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }

  protected async openNewSession(): Promise<void> {
    await this.submit(decls => this.money.openCashierSession(decls), 'Session opened');
  }

  protected async closeSession(sessionId: string): Promise<void> {
    const done = await this.submit(
      decls => this.money.closeCashierSession(sessionId, decls),
      'Session closed'
    );
    if (done) this.lastClosedSessionId.set(sessionId);
  }

  private async submit(
    action: (decls: { account_code: string; declared: number }[]) => Promise<string>,
    successMessage: string
  ): Promise<boolean> {
    const decls: { account_code: string; declared: number }[] = [];
    for (const account of this.accounts()) {
      const cents = parseKesToCents(this.declared[account.account_code] ?? '');
      if (cents === null) {
        this.error.set(`Enter a valid amount for ${account.label}`);
        return false;
      }
      decls.push({ account_code: account.account_code, declared: cents });
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action(decls);
      this.notice.set(successMessage);
      for (const a of this.accounts()) this.declared[a.account_code] = '0';
      await this.load();
      await this.cashierSessionState.refresh();
      return true;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Request failed');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected reconFor(sessionId: string): ReconAccountWithParent[] {
    return this.reconAccounts().filter(ra =>
      ra.reconciliations?.scope_ref_id.startsWith(`${sessionId}:`)
    );
  }

  protected startRevert(reconAccountId: string): void {
    this.revertingFor.set(reconAccountId);
    this.revertReason.setValue('');
  }

  protected async confirmRevert(reconAccountId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.revertVariance(reconAccountId, this.revertReason.value.trim() || undefined);
      this.notice.set('Variance reverted and marked reviewed');
      this.revertingFor.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected shortId(userId: string | null): string {
    return userId ? userId.slice(-4) : '????';
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }

  protected async printSlip(sessionId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildCashierSlipData(sessionId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
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
