import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashierSessionDialogService } from '../../core/cashier-session-dialog.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { parseKes } from '../../core/money';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { CompanyPreferencesService } from '../../core/company-preferences.service';
import { runIndependentLoads } from '../../core/independent-load';
import { PermissionsService } from '../../core/permissions.service';
import {
  CashierAccount,
  CashierSession,
  MoneyService,
  ReconAccountWithParent,
} from '../money.service';
import { CashierCountGuidance, cashierCountGuidance } from './cashier-count-guidance';

@Component({
  selector: 'app-cashier-session-modal',
  imports: [FormsModule, ButtonComponent, FormFieldComponent, IconComponent, MoneyComponent],
  template: `
    @if (dialog.visible()) {
      <dialog
        class="modal modal-open"
        aria-modal="true"
        aria-labelledby="cashier-session-dialog-title"
        (cancel)="$event.preventDefault(); close()"
      >
        <div class="modal-box modal-box-task p-0 md:w-full md:max-w-3xl">
          <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
            <div>
              <h2 id="cashier-session-dialog-title" class="type-title">
                {{ openSession() ? 'Close cashier session' : 'Open cashier session' }}
              </h2>
              <p class="type-caption mt-1">
                {{
                  reviewing()
                    ? 'Review the count before confirming.'
                    : !openSession() && !preferences.requireOpeningCount()
                      ? 'No opening count is required.'
                      : 'Count each controlled account.'
                }}
              </p>
            </div>
            <button
              appButton
              type="button"
              variant="ghost"
              [iconOnly]="true"
              aria-label="Close till dialog"
              [disabled]="busy()"
              (click)="close()"
            >
              <app-icon name="heroXMark" />
            </button>
          </header>

          <div class="modal-body p-4">
            @if (loading()) {
              <div class="flex min-h-40 items-center justify-center gap-2 text-base-content/60">
                <span class="loading loading-spinner loading-sm"></span>
                <span class="text-sm">Loading till accounts…</span>
              </div>
            } @else {
              @if (error()) {
                <div role="alert" class="alert alert-error mb-4 text-sm">
                  <app-icon name="heroExclamationTriangle" />
                  <span>{{ error() }}</span>
                </div>
              }

              @if (accounts().length === 0) {
                <div role="alert" class="alert alert-warning text-sm">
                  <app-icon name="heroExclamationTriangle" />
                  <span>No enabled cashier-controlled payment accounts are configured.</span>
                </div>
              } @else if (!openSession() && !preferences.requireOpeningCount()) {
                <div class="flex items-start gap-3 rounded-field bg-info/10 p-4 text-info-content">
                  <app-icon name="heroInformationCircle" class="mt-0.5" />
                  <div>
                    <p class="text-sm font-semibold">Open without counting</p>
                    <p class="type-caption mt-1">
                      Opening count is disabled in Settings. Current account balances will be used
                      without creating a variance.
                    </p>
                  </div>
                </div>
              } @else if (reviewing(); as action) {
                <div class="flex items-start gap-3 rounded-field bg-base-200/70 p-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-field"
                    [class.bg-primary/10]="action === 'open'"
                    [class.text-primary]="action === 'open'"
                    [class.bg-error/10]="action === 'close'"
                    [class.text-error]="action === 'close'"
                  >
                    <app-icon [name]="action === 'open' ? 'heroCheckCircle' : 'heroEyeSlash'" />
                  </div>
                  <div>
                    <p class="text-sm font-semibold">
                      Review {{ action === 'open' ? 'opening' : 'closing' }} count
                    </p>
                    <p class="type-caption mt-0.5">
                      @if (action === 'open') {
                        These balances will become the opening position.
                      } @else {
                        Check the count and its guidance before closing.
                      }
                    </p>
                  </div>
                </div>

                @if (guidanceError()) {
                  <div role="status" class="alert alert-warning mt-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ guidanceError() }}</span>
                  </div>
                }

                @if (permissions.has('ViewFinancials') && hasExpectedBalances()) {
                  <div class="mt-3 text-right">
                    <button
                      appButton
                      variant="ghost"
                      type="button"
                      (click)="showExact.set(!showExact())"
                    >
                      <app-icon [name]="showExact() ? 'heroEyeSlash' : 'heroEye'" />
                      {{ showExact() ? 'Hide expected amounts' : 'Show expected amounts' }}
                    </button>
                  </div>
                }

                <div class="mt-4 divide-y divide-base-300 rounded-field border border-base-300">
                  @for (account of accounts(); track account.account_code) {
                    <div
                      class="flex items-center justify-between gap-3 px-3 py-2.5"
                      [class.bg-success/10]="guidance(account.account_code) === 'close'"
                      [class.bg-warning/10]="guidance(account.account_code) === 'recount'"
                      [class.bg-error/10]="guidance(account.account_code) === 'large-difference'"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ account.label }}</p>
                        <p class="type-caption font-mono">{{ account.account_code }}</p>
                        @if (guidance(account.account_code); as result) {
                          <p
                            class="mt-1 text-xs font-medium"
                            [class.text-success]="result === 'close'"
                            [class.text-warning]="result === 'recount'"
                            [class.text-error]="result === 'large-difference'"
                          >
                            {{ guidanceLabel(result) }}
                          </p>
                        }
                        @if (showExact() && hasExpectedBalance(account.account_code)) {
                          <p class="type-caption mt-1">
                            Expected
                            <app-money [amount]="expectedAmount(account.account_code) ?? 0" /> ·
                            difference
                            <app-money [amount]="variance(account.account_code)" />
                          </p>
                        }
                      </div>
                      <p class="shrink-0 font-bold tabular-nums">
                        <app-money [amount]="reviewAmount(account.account_code)" />
                      </p>
                    </div>
                  }
                </div>
                @if (hasExpectedBalances()) {
                  <p class="type-caption mt-2">
                    Guidance uses the balance at review time. Final variance is calculated when you
                    confirm.
                  </p>
                }
              } @else {
                <div class="mb-4 flex items-start gap-2 rounded-field bg-base-200/70 p-3">
                  @if (openSession()) {
                    <app-icon name="heroEyeSlash" class="mt-0.5 text-base-content/60" />
                    <div>
                      <p class="text-sm font-medium">Blind closing count</p>
                      <p class="type-caption mt-1">
                        Count what is actually present. Guidance appears after you continue to
                        review.
                      </p>
                    </div>
                  } @else {
                    <app-icon name="heroInformationCircle" class="mt-0.5 text-base-content/60" />
                    <div>
                      <p class="text-sm font-medium">Opening balances</p>
                      <p class="type-caption mt-1">
                        Enter the physical or verified amount available in each controlled account.
                      </p>
                    </div>
                  }
                </div>

                <div class="grid gap-2 md:grid-cols-2">
                  @for (account of accounts(); track account.account_code; let first = $first) {
                    <div class="rounded-field border border-base-300/70 p-3">
                      <div class="mb-2 min-w-0">
                        <p class="text-sm font-semibold">{{ account.label }}</p>
                        <p class="type-caption font-mono">{{ account.account_code }}</p>
                        @if (
                          permissions.has('ViewFinancials') &&
                            !openSession() &&
                            previousClosing(account.account_code);
                          as previous
                        ) {
                          <p class="type-caption mt-1">
                            Previous closing:
                            <span class="font-medium text-base-content">
                              <app-money [amount]="previous.declared" />
                            </span>
                          </p>
                        }
                      </div>
                      <app-form-field
                        [label]="openSession() ? 'Counted amount (KES)' : 'Opening amount (KES)'"
                      >
                        <input
                          type="text"
                          inputmode="numeric"
                          class="input input-bordered min-h-11 w-full text-right font-semibold tabular-nums"
                          placeholder="0"
                          [attr.autofocus]="first ? '' : null"
                          [attr.aria-label]="
                            (openSession() ? 'Counted amount for ' : 'Opening amount for ') +
                            account.label
                          "
                          (focus)="$any($event.target).select()"
                          [(ngModel)]="declared[account.account_code]"
                        />
                      </app-form-field>
                    </div>
                  }
                </div>
              }
            }
          </div>

          <footer class="flex flex-wrap justify-end gap-2 border-t border-base-300 p-4">
            @if (loading()) {
              <button appButton variant="ghost" type="button" (click)="close()">Cancel</button>
            } @else if (!openSession() && !preferences.requireOpeningCount()) {
              <button appButton variant="ghost" type="button" (click)="close()">Cancel</button>
              <button appButton type="button" [loading]="busy()" (click)="confirm('open')">
                <app-icon name="heroLockOpen" /> Open till
              </button>
            } @else if (reviewing(); as action) {
              <button appButton variant="ghost" type="button" (click)="reviewing.set(null)">
                Back to count
              </button>
              <button
                appButton
                [variant]="action === 'close' ? 'error' : 'primary'"
                type="button"
                [loading]="busy()"
                (click)="confirm(action)"
              >
                <app-icon [name]="action === 'open' ? 'heroLockOpen' : 'heroLockClosed'" />
                Confirm {{ action === 'open' ? 'open' : 'close' }}
              </button>
            } @else {
              <button appButton variant="ghost" type="button" (click)="close()">Cancel</button>
              <button
                appButton
                type="button"
                [disabled]="accounts().length === 0"
                [loading]="guidanceLoading()"
                (click)="review(openSession() ? 'close' : 'open')"
              >
                Review {{ openSession() ? 'closing' : 'opening' }} count
                <app-icon name="heroChevronRight" />
              </button>
            }
          </footer>
        </div>

        <form method="dialog" class="modal-backdrop">
          <button type="button" aria-label="Close till dialog" (click)="close()">close</button>
        </form>
      </dialog>
    }

    @if (success(); as result) {
      <div class="toast toast-bottom toast-end z-[70]" aria-live="polite">
        <div class="alert alert-success max-w-sm shadow-overlay">
          <app-icon name="heroCheckCircle" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ result.title }}</p>
            <p class="text-sm">{{ result.message }}</p>
          </div>
          @if (result.closedSessionId && printerEnabled()) {
            <button
              appButton
              variant="outline"
              type="button"
              (click)="printSlip(result.closedSessionId)"
            >
              <app-icon name="heroPrinter" /> Print slip
            </button>
          }
          <button
            appButton
            variant="ghost"
            [iconOnly]="true"
            type="button"
            aria-label="Dismiss till message"
            (click)="success.set(null)"
          >
            <app-icon name="heroXMark" />
          </button>
        </div>
      </div>
    }

    @if (printError(); as message) {
      <div class="toast toast-bottom toast-end z-[70]" role="alert">
        <div class="alert alert-error max-w-sm shadow-overlay">
          <app-icon name="heroExclamationTriangle" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">Could not print slip</p>
            <p class="text-sm">{{ message }}</p>
          </div>
          <button
            appButton
            variant="ghost"
            [iconOnly]="true"
            type="button"
            aria-label="Dismiss print error"
            (click)="printError.set(null)"
          >
            <app-icon name="heroXMark" />
          </button>
        </div>
      </div>
    }
  `,
})
export class CashierSessionModalComponent {
  protected readonly dialog = inject(CashierSessionDialogService);
  private readonly sessionState = inject(CashierSessionService);
  protected readonly preferences = inject(CompanyPreferencesService);
  protected readonly permissions = inject(PermissionsService);
  private readonly money = inject(MoneyService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly openSession = signal<CashierSession | null>(null);
  protected readonly reconAccounts = signal<ReconAccountWithParent[]>([]);
  protected readonly expectedBalances = signal<Readonly<Record<string, number>>>({});
  protected readonly declared: Record<string, string> = {};
  protected readonly reviewing = signal<'open' | 'close' | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly guidanceLoading = signal(false);
  protected readonly guidanceError = signal<string | null>(null);
  protected readonly showExact = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly success = signal<{
    title: string;
    message: string;
    closedSessionId?: string;
  } | null>(null);
  protected readonly printError = signal<string | null>(null);
  private guidanceRequest = 0;

  constructor() {
    effect(() => {
      if (!this.dialog.visible()) {
        this.guidanceRequest += 1;
        this.guidanceLoading.set(false);
        return;
      }
      this.guidanceRequest += 1;
      this.openSession.set(this.sessionState.session());
      this.reviewing.set(null);
      this.error.set(null);
      this.guidanceError.set(null);
      this.guidanceLoading.set(false);
      this.expectedBalances.set({});
      this.showExact.set(false);
      this.success.set(null);
      void this.load();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    let sessionError: string | null = null;
    try {
      this.openSession.set(await this.money.openSession());
    } catch (err) {
      sessionError = err instanceof Error ? err.message : 'Failed to load the open cashier session';
    }
    const sessionId = this.openSession()?.id ?? null;
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load till accounts',
        run: async () => {
          const accounts = await this.money.cashierAccounts(sessionId);
          this.accounts.set(accounts);
          for (const account of accounts) this.declared[account.account_code] ??= '0';
        },
      },
      {
        fallback: 'Failed to load recent cashier sessions',
        run: async () => {
          if (!this.permissions.has('ViewFinancials')) {
            this.reconAccounts.set([]);
            return;
          }
          const sessions = await this.money.recentSessions(10);
          this.reconAccounts.set(
            await this.money.sessionReconAccounts(sessions.map(session => session.id))
          );
        },
      },
      {
        fallback: 'Failed to load printer settings',
        run: async () => this.printerEnabled.set(await this.receiptData.printerEnabled()),
      },
    ]);
    this.error.set([sessionError, ...errors].filter(Boolean).join('. ') || null);
    this.loading.set(false);
  }

  protected close(): void {
    if (this.busy()) return;
    this.guidanceRequest += 1;
    this.reviewing.set(null);
    this.error.set(null);
    this.guidanceError.set(null);
    this.guidanceLoading.set(false);
    this.expectedBalances.set({});
    this.showExact.set(false);
    this.dialog.hide();
  }

  protected async review(action: 'open' | 'close'): Promise<void> {
    if (!this.declarations()) return;
    this.error.set(null);
    this.guidanceError.set(null);
    this.showExact.set(false);
    this.guidanceLoading.set(true);
    const request = ++this.guidanceRequest;
    try {
      const balances = await this.money.cashierExpectedBalances(this.openSession()?.id ?? null);
      if (request !== this.guidanceRequest || !this.dialog.visible()) return;
      this.expectedBalances.set(
        Object.fromEntries(balances.map(row => [row.account_code, row.expected_balance]))
      );
    } catch {
      if (request !== this.guidanceRequest || !this.dialog.visible()) return;
      this.expectedBalances.set({});
      this.guidanceError.set('Balance guidance is unavailable. You can still review and continue.');
    } finally {
      if (request !== this.guidanceRequest || !this.dialog.visible()) return;
      this.guidanceLoading.set(false);
      this.reviewing.set(action);
    }
  }

  protected async confirm(action: 'open' | 'close'): Promise<void> {
    const declarations =
      action === 'open' && !this.preferences.requireOpeningCount() ? [] : this.declarations();
    if (!declarations) return;

    const session = this.openSession();
    if (action === 'close' && !session) {
      this.reviewing.set(null);
      this.error.set('The till is no longer open. Close this dialog and try again.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      if (action === 'open') {
        await this.money.openCashierSession(declarations);
        this.success.set({
          title: 'Till opened',
          message: 'The cashier can now take payments.',
        });
      } else {
        await this.money.closeCashierSession(session!.id, declarations);
        this.success.set({
          title: 'Till closed',
          message: 'The closing count was recorded.',
          closedSessionId: session!.id,
        });
      }
      for (const account of this.accounts()) this.declared[account.account_code] = '0';
      await this.sessionState.refresh();
      this.dialog.hide();
      this.dialog.markCompleted();
      this.reviewing.set(null);
      this.expectedBalances.set({});
      this.showExact.set(false);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Till update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected reviewAmount(accountCode: string): number {
    return parseKes(this.declared[accountCode] ?? '') ?? 0;
  }

  protected hasExpectedBalances(): boolean {
    return Object.keys(this.expectedBalances()).length > 0;
  }

  protected expectedAmount(accountCode: string): number | null {
    const balances = this.expectedBalances();
    return Object.prototype.hasOwnProperty.call(balances, accountCode)
      ? balances[accountCode]
      : null;
  }

  protected hasExpectedBalance(accountCode: string): boolean {
    return this.expectedAmount(accountCode) !== null;
  }

  protected variance(accountCode: string): number {
    return this.reviewAmount(accountCode) - (this.expectedAmount(accountCode) ?? 0);
  }

  protected guidance(accountCode: string): CashierCountGuidance | null {
    const expected = this.expectedAmount(accountCode);
    if (expected === null) return null;
    return cashierCountGuidance(
      this.reviewAmount(accountCode),
      expected,
      this.preferences.varianceNotificationThreshold()
    );
  }

  protected guidanceLabel(guidance: CashierCountGuidance): string {
    switch (guidance) {
      case 'close':
        return 'Count looks close';
      case 'recount':
        return 'Please recount';
      case 'large-difference':
        return 'Large difference — check carefully';
    }
  }

  protected previousClosing(accountCode: string): ReconAccountWithParent | undefined {
    return this.reconAccounts()
      .filter(
        row =>
          row.account_code === accountCode && row.reconciliations?.scope_ref_id.endsWith(':closing')
      )
      .sort(
        (a, b) =>
          new Date(b.reconciliations?.created_at ?? 0).getTime() -
          new Date(a.reconciliations?.created_at ?? 0).getTime()
      )[0];
  }

  private declarations(): { account_code: string; declared: number }[] | null {
    const declarations: { account_code: string; declared: number }[] = [];
    for (const account of this.accounts()) {
      const amount = parseKes(this.declared[account.account_code] ?? '');
      if (amount === null || amount < 0) {
        this.error.set(`Enter a valid non-negative amount for ${account.label}`);
        return null;
      }
      declarations.push({ account_code: account.account_code, declared: amount });
    }
    return declarations;
  }

  protected async printSlip(sessionId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildCashierSlipData(sessionId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (error) {
      this.printError.set(error instanceof Error ? error.message : 'Print failed');
    }
  }
}
