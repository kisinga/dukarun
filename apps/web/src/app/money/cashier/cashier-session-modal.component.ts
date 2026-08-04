import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashierSessionDialogService } from '../../core/cashier-session-dialog.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { parseKesToCents } from '../../core/money';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { CompanyPreferencesService } from '../../core/company-preferences.service';
import {
  CashierAccount,
  CashierSession,
  MoneyService,
  ReconAccountWithParent,
} from '../money.service';

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
        <div class="modal-box max-w-3xl p-0">
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

          <div class="max-h-[min(70vh,44rem)] overflow-y-auto p-4">
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
                        Expected balances remain hidden. Variances appear only after closing.
                      }
                    </p>
                  </div>
                </div>

                <div class="mt-4 divide-y divide-base-300 rounded-field border border-base-300">
                  @for (account of accounts(); track account.account_code) {
                    <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ account.label }}</p>
                        <p class="type-caption font-mono">{{ account.account_code }}</p>
                      </div>
                      <p class="shrink-0 font-bold tabular-nums">
                        <app-money [cents]="reviewAmount(account.account_code)" />
                      </p>
                    </div>
                  }
                </div>
              } @else {
                <div class="mb-4 flex items-start gap-2 rounded-field bg-base-200/70 p-3">
                  @if (openSession()) {
                    <app-icon name="heroEyeSlash" class="mt-0.5 text-base-content/60" />
                    <div>
                      <p class="text-sm font-medium">Blind closing count</p>
                      <p class="type-caption mt-1">
                        Count what is actually present. Expected amounts and variances appear only
                        after closing.
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
                        @if (!openSession() && previousClosing(account.account_code); as previous) {
                          <p class="type-caption mt-1">
                            Previous closing:
                            <span class="font-medium text-base-content">
                              <app-money [cents]="previous.declared" />
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
  `,
})
export class CashierSessionModalComponent {
  protected readonly dialog = inject(CashierSessionDialogService);
  private readonly sessionState = inject(CashierSessionService);
  protected readonly preferences = inject(CompanyPreferencesService);
  private readonly money = inject(MoneyService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly accounts = signal<CashierAccount[]>([]);
  protected readonly openSession = signal<CashierSession | null>(null);
  protected readonly reconAccounts = signal<ReconAccountWithParent[]>([]);
  protected readonly declared: Record<string, string> = {};
  protected readonly reviewing = signal<'open' | 'close' | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly success = signal<{
    title: string;
    message: string;
    closedSessionId?: string;
  } | null>(null);

  constructor() {
    effect(() => {
      if (!this.dialog.visible()) return;
      this.openSession.set(this.sessionState.session());
      this.reviewing.set(null);
      this.error.set(null);
      this.success.set(null);
      void this.load();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [accounts, open, sessions, printerEnabled] = await Promise.all([
        this.money.cashierAccounts(),
        this.money.openSession(),
        this.money.recentSessions(10),
        this.receiptData.printerEnabled(),
      ]);
      const reconAccounts = await this.money.sessionReconAccounts(
        sessions.map(session => session.id)
      );
      this.accounts.set(accounts);
      this.openSession.set(open);
      this.reconAccounts.set(reconAccounts);
      this.printerEnabled.set(printerEnabled);
      for (const account of accounts) this.declared[account.account_code] ??= '0';
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load till accounts');
    } finally {
      this.loading.set(false);
    }
  }

  protected close(): void {
    if (this.busy()) return;
    this.reviewing.set(null);
    this.error.set(null);
    this.dialog.hide();
  }

  protected review(action: 'open' | 'close'): void {
    if (!this.declarations()) return;
    this.error.set(null);
    this.reviewing.set(action);
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
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Till update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected reviewAmount(accountCode: string): number {
    return parseKesToCents(this.declared[accountCode] ?? '') ?? 0;
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
      const cents = parseKesToCents(this.declared[account.account_code] ?? '');
      if (cents === null || cents < 0) {
        this.error.set(`Enter a valid non-negative amount for ${account.label}`);
        return null;
      }
      declarations.push({ account_code: account.account_code, declared: cents });
    }
    return declarations;
  }

  protected async printSlip(sessionId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildCashierSlipData(sessionId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (error) {
      this.success.set({
        title: 'Could not print slip',
        message: error instanceof Error ? error.message : 'Print failed',
      });
    }
  }
}
