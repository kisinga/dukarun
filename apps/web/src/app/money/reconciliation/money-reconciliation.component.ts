import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { parseKes } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { runIndependentLoads } from '../../core/independent-load';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import {
  MoneyService,
  type ReconAccount,
  type ReconcilableAccount,
  type Reconciliation,
} from '../money.service';

type ReconciliationWithAccounts = Reconciliation & { reconciliation_accounts: ReconAccount[] };

@Component({
  selector: 'app-money-reconciliation',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
  ],
  template: `
    <div class="mb-4 flex items-start gap-3">
      <div>
        <h2 class="section-title">Account reconciliation</h2>
        <p class="type-caption mt-1">
          Verify company-wide cash, bank, and mobile-money balances independently.
        </p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        type="button"
        title="Refresh balances"
        aria-label="Refresh balances"
        [loading]="loading()"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
    </div>

    @if (error()) {
      <div role="alert" class="alert alert-error mb-3 text-sm">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div role="status" class="alert alert-success mb-3 text-sm">
        <app-icon name="heroCheckCircle" />
        <span>{{ notice() }}</span>
      </div>
    }

    <div class="mb-4 flex items-start gap-3 rounded-field bg-info/10 p-3 text-sm">
      <app-icon name="heroInformationCircle" class="mt-0.5 shrink-0" />
      <p>
        These are company-wide money balances. Supplier balances stay on each supplier's account.
        <a routerLink="/suppliers" class="link link-primary font-medium">Open suppliers</a>
      </p>
    </div>

    @if (loading() && accounts().length === 0) {
      <div class="flex min-h-32 items-center justify-center gap-2 text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        <span class="text-sm">Loading account balances…</span>
      </div>
    } @else if (accounts().length === 0) {
      <app-empty-state
        icon="heroBanknotes"
        title="No adjustable money accounts"
        description="Active cash, bank, and mobile-money accounts will appear here."
      />
    } @else {
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        @for (account of accounts(); track account.account_code) {
          <article class="card border border-base-300/70 bg-base-100">
            <div class="card-body gap-3 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate font-semibold">{{ account.account_name }}</h3>
                  <p class="type-caption font-mono">{{ account.account_code }}</p>
                </div>
                @if (account.requires_reconciliation) {
                  <span class="badge badge-warning badge-outline badge-sm">Period required</span>
                }
              </div>
              <div>
                <p class="type-caption">Current book balance</p>
                <p class="mt-1 text-xl font-bold tabular-nums">
                  <app-money [amount]="account.balance" />
                </p>
                <p class="type-caption mt-1">
                  {{
                    account.last_reconciled_at
                      ? 'Last verified ' + time(account.last_reconciled_at)
                      : 'Never verified'
                  }}
                </p>
              </div>
              @if (perms.has('ManageReconciliation')) {
                <button appButton variant="outline" type="button" (click)="open(account)">
                  Set actual balance
                </button>
              } @else {
                <p class="type-caption">View only · reconciliation permission required</p>
              }
            </div>
          </article>
        }
      </div>
    }

    <section class="mt-6">
      <div class="mb-3">
        <h2 class="section-title">Reconciliation history</h2>
        <p class="type-caption mt-1">
          An adjustment can be reverted until that same account is reconciled again.
        </p>
      </div>
      @if (!loading() && recons().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroDocumentText"
          title="No reconciliation history"
          description="Verified balances and till counts will appear here."
        />
      } @else {
        <div class="flex flex-col gap-2">
          @for (recon of recons(); track recon.id) {
            @for (row of recon.reconciliation_accounts; track row.id) {
              <article class="rounded-box border border-base-300/70 bg-base-100 p-3">
                <div class="flex flex-wrap items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold">{{ accountName(row.account_code) }}</p>
                      <span class="badge badge-ghost badge-sm">{{ scopeLabel(recon.scope) }}</span>
                    </div>
                    <p class="type-caption mt-0.5 font-mono">{{ row.account_code }}</p>
                    <p class="type-caption mt-1">
                      Book <app-money [amount]="row.expected" /> · Actual
                      <app-money [amount]="row.declared" /> · {{ time(recon.created_at) }}
                    </p>
                    @if (row.reason) {
                      <p class="mt-1 text-sm text-base-content/70">{{ row.reason }}</p>
                    }
                  </div>
                  <div class="shrink-0 text-right">
                    <p
                      class="font-semibold tabular-nums"
                      [class.text-error]="row.variance !== 0 && !row.reviewed_at"
                    >
                      {{ row.variance > 0 ? '+' : '' }}<app-money [amount]="row.variance" />
                    </p>
                    @if (row.reviewed_at) {
                      <p class="type-caption mt-1">Reverted {{ date(row.reviewed_at) }}</p>
                    } @else if (row.variance !== 0 && perms.has('ManageReconciliation')) {
                      @if (!canRevert(row)) {
                        <p class="type-caption mt-1">Review window closed</p>
                      } @else if (revertingFor() === row.id) {
                        <div class="mt-2 flex max-w-xs flex-col items-end gap-1">
                          <input
                            type="text"
                            maxlength="500"
                            required
                            class="input input-bordered input-sm w-full"
                            placeholder="Why reverse this adjustment?"
                            aria-label="Reversal reason"
                            [formControl]="revertReason"
                          />
                          <div class="flex gap-1">
                            <button
                              appButton
                              variant="ghost"
                              type="button"
                              [disabled]="busy()"
                              (click)="revertingFor.set(null)"
                            >
                              Cancel
                            </button>
                            <button
                              appButton
                              variant="outline"
                              type="button"
                              [loading]="busy()"
                              (click)="confirmRevert(row.id)"
                            >
                              Confirm revert
                            </button>
                          </div>
                        </div>
                      } @else {
                        <button
                          appButton
                          variant="ghost"
                          type="button"
                          class="mt-1"
                          (click)="startRevert(row.id)"
                        >
                          Revert
                        </button>
                      }
                    }
                  </div>
                </div>
              </article>
            }
          }
        </div>
      }
    </section>

    @if (selected(); as account) {
      <dialog
        class="modal modal-open"
        aria-modal="true"
        aria-labelledby="reconcile-dialog-title"
        (cancel)="$event.preventDefault(); close()"
      >
        <div class="modal-box max-w-lg p-0">
          <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
            <div>
              <h2 id="reconcile-dialog-title" class="type-title">Set actual balance</h2>
              <p class="type-caption mt-1">
                {{ account.account_name }} · {{ account.account_code }}
              </p>
            </div>
            <button
              appButton
              type="button"
              variant="ghost"
              [iconOnly]="true"
              aria-label="Close reconciliation"
              [disabled]="busy()"
              (click)="close()"
            >
              <app-icon name="heroXMark" />
            </button>
          </header>

          <div class="p-4">
            @if (error()) {
              <div role="alert" class="alert alert-error mb-4 text-sm">
                <app-icon name="heroExclamationTriangle" />
                <span>{{ error() }}</span>
              </div>
            }
            @if (confirming()) {
              <div class="divide-y divide-base-300 rounded-field border border-base-300">
                <div class="flex justify-between gap-3 p-3 text-sm">
                  <span>Current book balance</span>
                  <strong><app-money [amount]="account.balance" /></strong>
                </div>
                <div class="flex justify-between gap-3 p-3 text-sm">
                  <span>Verified actual balance</span>
                  <strong><app-money [amount]="parsedActual() ?? 0" /></strong>
                </div>
                <div class="flex justify-between gap-3 p-3 text-sm">
                  <span>Adjustment</span>
                  <strong [class.text-error]="variance() !== 0">
                    {{ (variance() ?? 0) > 0 ? '+' : '' }}<app-money [amount]="variance() ?? 0" />
                  </strong>
                </div>
              </div>
              @if (reason.value.trim()) {
                <div class="mt-3 rounded-field bg-base-200/70 p-3 text-sm">
                  <span class="type-caption">Reason</span>
                  <p class="mt-1">{{ reason.value.trim() }}</p>
                </div>
              }
            } @else {
              <div class="rounded-field bg-base-200/70 p-3">
                <p class="type-caption">Current book balance</p>
                <p class="mt-1 text-xl font-bold"><app-money [amount]="account.balance" /></p>
              </div>
              <div class="mt-4 grid gap-3">
                <app-form-field label="Actual verified balance (KES)" [required]="true">
                  <input
                    type="text"
                    inputmode="numeric"
                    class="input input-bordered min-h-11 w-full text-right font-semibold tabular-nums"
                    [formControl]="actual"
                    (focus)="$any($event.target).select()"
                  />
                </app-form-field>
                <app-form-field
                  label="Reason"
                  [required]="variance() !== 0"
                  hint="Required when changing the book balance."
                >
                  <input
                    type="text"
                    maxlength="500"
                    class="input input-bordered min-h-11 w-full"
                    placeholder="What caused the difference?"
                    [formControl]="reason"
                  />
                </app-form-field>
              </div>
              @if (variance() !== null) {
                <div
                  class="mt-4 flex items-center justify-between rounded-field border p-3 text-sm"
                >
                  <span>{{ varianceLabel() }}</span>
                  <strong [class.text-error]="variance() !== 0">
                    {{ (variance() ?? 0) > 0 ? '+' : '' }}<app-money [amount]="variance() ?? 0" />
                  </strong>
                </div>
              }
            }
          </div>

          <footer class="flex justify-end gap-2 border-t border-base-300 p-4">
            @if (confirming()) {
              <button
                appButton
                variant="ghost"
                type="button"
                [disabled]="busy()"
                (click)="confirming.set(false)"
              >
                Back
              </button>
              <button appButton type="button" [loading]="busy()" (click)="save()">
                Confirm balance
              </button>
            } @else {
              <button appButton variant="ghost" type="button" (click)="close()">Cancel</button>
              <button appButton type="button" (click)="review()">Review change</button>
            }
          </footer>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" aria-label="Close reconciliation" (click)="close()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class MoneyReconciliationComponent implements OnInit {
  private readonly money = inject(MoneyService);
  protected readonly perms = inject(PermissionsService);

  protected readonly accounts = signal<ReconcilableAccount[]>([]);
  protected readonly recons = signal<ReconciliationWithAccounts[]>([]);
  protected readonly selected = signal<ReconcilableAccount | null>(null);
  protected readonly actual = new FormControl('', { nonNullable: true });
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly confirming = signal(false);
  protected readonly revertingFor = signal<string | null>(null);
  protected readonly revertReason = new FormControl('', { nonNullable: true });
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected parsedActual(): number | null {
    return parseKes(this.actual.value);
  }

  protected variance(): number | null {
    const account = this.selected();
    const actual = this.parsedActual();
    return account && actual !== null ? actual - account.balance : null;
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load account balances',
        run: async () => this.accounts.set(await this.money.reconcilableAccounts()),
      },
      {
        fallback: 'Failed to load reconciliation history',
        run: async () => this.recons.set(await this.money.recentReconciliations(30)),
      },
    ]);
    this.error.set(errors.length ? errors.join('. ') : null);
    this.loading.set(false);
  }

  protected open(account: ReconcilableAccount): void {
    this.selected.set(account);
    this.actual.setValue(String(account.balance));
    this.reason.setValue('');
    this.confirming.set(false);
    this.error.set(null);
    this.notice.set(null);
  }

  protected close(): void {
    if (this.busy()) return;
    this.selected.set(null);
    this.confirming.set(false);
  }

  protected review(): void {
    if (this.parsedActual() === null) {
      this.error.set('Enter a valid non-negative balance');
      return;
    }
    if (this.variance() !== 0 && !this.reason.value.trim()) {
      this.error.set('Enter a reason for changing the book balance');
      return;
    }
    this.error.set(null);
    this.confirming.set(true);
  }

  protected async save(): Promise<void> {
    const account = this.selected();
    const declared = this.parsedActual();
    if (!account || declared === null) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.recordManualReconciliation([
        {
          account_code: account.account_code,
          declared,
          ...(this.reason.value.trim() ? { reason: this.reason.value.trim() } : {}),
        },
      ]);
      this.selected.set(null);
      this.confirming.set(false);
      this.notice.set(`${account.account_name} balance verified`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected varianceLabel(): string {
    const variance = this.variance();
    if (variance === 0) return 'No adjustment needed';
    return variance !== null && variance > 0
      ? 'Book balance will increase'
      : 'Book balance will decrease';
  }

  protected canRevert(row: ReconAccount): boolean {
    for (const reconciliation of this.recons()) {
      const latest = reconciliation.reconciliation_accounts.find(
        candidate => candidate.account_code === row.account_code
      );
      if (latest) return latest.id === row.id;
    }
    return false;
  }

  protected startRevert(id: string): void {
    this.revertingFor.set(id);
    this.revertReason.setValue('');
  }

  protected async confirmRevert(id: string): Promise<void> {
    const reason = this.revertReason.value.trim();
    if (!reason) {
      this.error.set('Enter a reason for reverting the adjustment');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.revertVariance(id, reason);
      this.revertingFor.set(null);
      this.notice.set('Adjustment reverted');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected accountName(code: string): string {
    return this.accounts().find(account => account.account_code === code)?.account_name ?? code;
  }

  protected scopeLabel(scope: string): string {
    if (scope === 'cash-session') return 'Till count';
    if (scope === 'manual') return 'Manual';
    return 'Payment method';
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
}
