import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { parseKesToCents } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import {
  AccountingPeriod,
  CashierAccount,
  MoneyService,
  PeriodLock,
  ReconAccount,
  Reconciliation,
} from '../money.service';

@Component({
  selector: 'app-money-periods',
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

    @if (lock(); as l) {
      <div class="alert alert-warning mb-4">
        <span
          >Books are locked through <strong>{{ l.lock_end_date }}</strong
          >.</span
        >
      </div>
    }

    <!-- Manual reconciliation -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Manual reconciliation</h2>
        <p class="text-xs text-base-content/60">
          Declare actual balances per cashier-controlled account (e.g. after checking the M-Pesa
          statement or the bank). A reason is required for accounts with variance.
        </p>
        <div class="mt-2 flex flex-col gap-2">
          @for (account of accounts(); track account.account_code) {
            <div class="flex flex-wrap items-end gap-2">
              <app-form-field
                class="w-48"
                [label]="account.label + ' (' + account.account_code + ')'"
              >
                <input
                  type="text"
                  inputmode="numeric"
                  class="input input-bordered input-sm w-full"
                  placeholder="0"
                  [(ngModel)]="declared[account.account_code]"
                />
              </app-form-field>
              <app-form-field label="Reason (optional)" class="flex-1">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  [(ngModel)]="reasons[account.account_code]"
                />
              </app-form-field>
            </div>
          }
          <button
            appButton
            class="mt-2 self-start"
            [loading]="busy()"
            [disabled]="accounts().length === 0"
            (click)="reconcile()"
          >
            Record reconciliation
          </button>
        </div>
      </div>
    </div>

    <!-- Close period -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Close accounting period</h2>
        <p class="text-xs text-base-content/60">
          Closing locks all posting through the end date. The backend gates this on reconciliations
          and open sessions — its messages are shown verbatim.
        </p>
        <form
          (submit)="$event.preventDefault(); askClose()"
          class="mt-2 flex flex-wrap items-end gap-2"
        >
          <app-form-field label="Period end date">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [formControl]="endDate"
            />
          </app-form-field>
          @if (confirmClose()) {
            <button appButton variant="error" type="submit" [loading]="busy()">
              Confirm close
            </button>
            <button appButton variant="ghost" type="button" (click)="confirmClose.set(false)">
              Cancel
            </button>
          } @else {
            <button appButton variant="outline" type="submit">Close period</button>
          }
        </form>
      </div>
    </div>

    <!-- Recent reconciliations (variance review) -->
    <h2 class="section-title mb-2">Recent reconciliations</h2>
    @if (recons().length === 0) {
      <p class="mb-4 text-sm text-base-content/60">No reconciliations recorded yet.</p>
    } @else {
      <div class="mb-4 flex flex-col gap-2">
        @for (recon of recons(); track recon.id) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex items-center gap-3">
                <span class="badge badge-outline">{{ recon.scope }}</span>
                <span class="type-caption">{{ time(recon.created_at) }}</span>
              </div>
              <div class="table-scroll">
                <table class="table table-sm mt-2">
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
                    @for (ra of recon.reconciliation_accounts; track ra.id) {
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
            </div>
          </div>
        }
      </div>
    }

    <!-- Periods list -->
    <h2 class="section-title mb-2">Periods</h2>
    @if (periods().length === 0) {
      <app-empty-state
        icon="heroClipboardDocumentList"
        title="No periods yet"
        description="Reconcile, then close your first accounting period below."
      />
    } @else {
      <div class="card bg-base-100">
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
                  <app-status-badge type="neutral" [label]="p.status" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
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
  protected readonly recons = signal<
    (Reconciliation & { reconciliation_accounts: ReconAccount[] })[]
  >([]);
  protected readonly revertingFor = signal<string | null>(null);
  protected readonly revertReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [accounts, periods, lock, recons] = await Promise.all([
        this.money.cashierAccounts(),
        this.money.periods(),
        this.money.periodLock(),
        this.money.recentReconciliations(),
      ]);
      this.accounts.set(accounts);
      this.periods.set(periods);
      this.lock.set(lock);
      this.recons.set(recons);
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

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
