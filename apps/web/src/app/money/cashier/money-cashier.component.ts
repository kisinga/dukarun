import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CashierSessionDialogService } from '../../core/cashier-session-dialog.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { PermissionsService } from '../../core/permissions.service';
import { runIndependentLoads } from '../../core/independent-load';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import {
  CashierAccount,
  CashierSession,
  MoneyService,
  ReconAccountWithParent,
  SessionWithCounts,
} from '../money.service';

@Component({
  selector: 'app-money-cashier',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    MoneyComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    IconComponent,
  ],
  template: `
    <div class="mb-3 flex flex-wrap items-start gap-3">
      <div>
        <h2 class="section-title">Cashier sessions</h2>
        <p class="type-caption mt-1">Review session history and recent count variances.</p>
      </div>
      <button
        appButton
        variant="ghost"
        [iconOnly]="true"
        class="ml-auto"
        type="button"
        title="Refresh cashier sessions"
        aria-label="Refresh cashier sessions"
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
    @if (cashierSession.configurationLoaded() && !cashierSession.cashControlEnabled()) {
      <div role="status" class="alert alert-info mb-3 text-sm">
        <app-icon name="heroInformationCircle" />
        <span
          >Cash control is off. Payments do not require an opening or closing till session.</span
        >
      </div>
    }

    @if (cashierSession.cashControlEnabled()) {
      <div class="card mb-4 bg-base-100">
        <div class="flex flex-wrap items-center gap-3 p-4">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field"
            [class.bg-success/10]="openSession()"
            [class.text-success]="openSession()"
            [class.bg-base-200]="!openSession()"
            [class.text-base-content/50]="!openSession()"
          >
            <app-icon [name]="openSession() ? 'heroLockOpen' : 'heroLockClosed'" size="lg" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold">
                {{ openSession() ? 'Till is open' : 'Till is closed' }}
              </h3>
              <app-status-badge
                size="xs"
                [type]="openSession() ? 'success' : 'neutral'"
                [label]="openSession() ? 'Open' : 'Closed'"
              />
            </div>
            <p class="type-caption mt-0.5">
              @if (openSession(); as session) {
                Opened {{ time(session.opened_at) }} · {{ accounts().length }} controlled
                {{ accounts().length === 1 ? 'account' : 'accounts' }}
              } @else {
                No active cashier session.
              }
            </p>
          </div>
          <button
            appButton
            class="ml-auto"
            [variant]="openSession() ? 'outline' : 'primary'"
            type="button"
            [disabled]="accounts().length === 0"
            (click)="cashierDialog.show()"
          >
            <app-icon [name]="openSession() ? 'heroLockClosed' : 'heroLockOpen'" />
            {{ openSession() ? 'Close session' : 'Open session' }}
          </button>
        </div>
      </div>
    }

    <h2 class="section-title mb-2">Recent sessions</h2>
    <p class="type-caption mb-3">
      A variance can only be reverted before the next opening, closing, or reconciliation.
    </p>
    @if (!loading() && sessions().length === 0) {
      <app-empty-state
        icon="heroBanknotes"
        title="No sessions yet"
        description="Use the Till action to open the first cashier session."
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
                <div class="mt-2 divide-y divide-base-200 rounded-box border border-base-300/60">
                  @for (count of session.cash_drawer_counts; track count.id) {
                    <div class="flex items-center gap-3 p-3">
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold">{{ count.count_type }}</p>
                        <p class="type-caption mt-1">
                          Declared <app-money [amount]="count.declared_cash" /> · expected
                          <app-money [amount]="count.expected_cash" />
                        </p>
                      </div>
                      <p class="shrink-0 font-semibold" [class.text-error]="count.variance !== 0">
                        <app-money [amount]="count.variance" />
                      </p>
                    </div>
                  }
                </div>
              }
              @if (reconFor(session.id).length > 0) {
                <h3 class="type-heading mt-3">Variance review</h3>
                <div class="mt-2 divide-y divide-base-200 rounded-box border border-base-300/60">
                  @for (ra of reconFor(session.id); track ra.id) {
                    <div class="p-3">
                      <div class="flex items-center gap-3">
                        <div class="min-w-0 flex-1">
                          <p class="font-mono text-sm font-semibold">{{ ra.account_code }}</p>
                          <p class="type-caption mt-1">
                            Declared <app-money [amount]="ra.declared" /> · expected
                            <app-money [amount]="ra.expected" />
                          </p>
                        </div>
                        <p
                          class="shrink-0 font-semibold"
                          [class.text-error]="ra.variance !== 0 && !ra.reviewed_at"
                        >
                          <app-money [amount]="ra.variance" />
                        </p>
                      </div>
                      <div class="mt-2 text-right">
                        @if (ra.reviewed_at) {
                          <span class="type-caption">
                            Reviewed · User …{{ shortId(ra.reviewed_by) }} ·
                            {{ date(ra.reviewed_at) }}
                          </span>
                        } @else if (ra.variance !== 0) {
                          @if (!perms.has('ManageReconciliation')) {
                            <span class="type-caption">Manager review</span>
                          } @else if (!canRevert(ra)) {
                            <span
                              class="type-caption"
                              title="A newer opening, closing, or reconciliation has occurred"
                            >
                              Review window closed
                            </span>
                          } @else if (revertingFor() === ra.id) {
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
                              <button class="btn btn-ghost btn-xs" (click)="revertingFor.set(null)">
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
                      </div>
                    </div>
                  }
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
  private readonly money = inject(MoneyService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierDialog = inject(CashierSessionDialogService);

  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly openSession = signal<CashierSession | null>(null);
  protected readonly sessions = signal<SessionWithCounts[]>([]);
  protected readonly reconAccounts = signal<ReconAccountWithParent[]>([]);
  protected readonly latestReconciliationId = signal<string | null>(null);
  protected readonly revertingFor = signal<string | null>(null);
  protected readonly revertReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.cashierDialog.completed() > 0) void this.load();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load cashier accounts',
        run: async () => this.accounts.set(await this.money.cashierAccounts()),
      },
      {
        fallback: 'Failed to load the open cashier session',
        run: async () => this.openSession.set(await this.money.openSession()),
      },
      {
        fallback: 'Failed to load recent cashier sessions',
        run: async () => {
          const sessions = await this.money.recentSessions();
          this.sessions.set(sessions);
          this.reconAccounts.set(
            await this.money.sessionReconAccounts(sessions.map(session => session.id))
          );
        },
      },
      {
        fallback: 'Failed to load the latest reconciliation',
        run: async () => this.latestReconciliationId.set(await this.money.latestReconciliationId()),
      },
    ]);
    this.error.set(errors.length > 0 ? errors.join('. ') : null);
    this.loading.set(false);
  }

  protected reconFor(sessionId: string): ReconAccountWithParent[] {
    return this.reconAccounts().filter(account =>
      account.reconciliations?.scope_ref_id.startsWith(`${sessionId}:`)
    );
  }

  protected canRevert(account: ReconAccountWithParent): boolean {
    return account.reconciliations?.id === this.latestReconciliationId();
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
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Revert failed');
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
}
