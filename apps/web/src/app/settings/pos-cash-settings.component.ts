import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CashierSessionService } from '../core/cashier-session.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { CompanySettingsStore } from './company-settings.store';
import type { CompanySettings } from './settings.service';

@Component({
  selector: 'app-pos-cash-settings',
  imports: [ReactiveFormsModule, ButtonComponent, IconComponent],
  template: `
    @if (loading()) {
      <div class="card h-full bg-base-100">
        <div class="card-body gap-3 p-4">
          <div class="skeleton h-6 w-44"></div>
          <div class="skeleton h-64 w-full"></div>
        </div>
      </div>
    } @else if (loadError()) {
      <div class="card h-full bg-base-100">
        <div class="card-body gap-3 p-4">
          <h2 class="section-title">POS &amp; cash control</h2>
          <p class="text-sm text-error">{{ loadError() }}</p>
          <button
            appButton
            variant="outline"
            size="sm"
            type="button"
            class="w-fit"
            (click)="load()"
          >
            Retry
          </button>
        </div>
      </div>
    } @else {
      <div class="card h-full bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="section-title">POS &amp; cash control</h2>
              <p class="type-caption mt-1">
                Checkout flow, receipt printing, and till-session rules.
              </p>
            </div>
            @if (dirty()) {
              <span class="badge badge-warning badge-sm">Unsaved changes</span>
            }
          </div>

          <form (submit)="$event.preventDefault(); save()" class="mt-3">
            <div class="divide-y divide-base-300">
              <label class="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Enable receipt printing</span>
                  <span class="block text-xs text-base-content/60">
                    Print a receipt after each completed sale.
                  </span>
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary"
                  [formControl]="enablePrinter"
                />
              </label>

              <div class="py-3">
                <label class="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span class="block text-sm font-medium">Use a separate cashier queue</span>
                    <span class="block text-xs text-base-content/60">
                      When off, sellers take payment and complete orders directly on the Sell
                      screen.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="cashierFlow"
                  />
                </label>
                @if (!cashierFlow.value) {
                  <p class="mt-2 flex items-start gap-1.5 text-xs text-info">
                    <app-icon name="heroInformationCircle" size="sm" />
                    <span
                      >Direct checkout will be used. New orders will not enter a cashier
                      queue.</span
                    >
                  </p>
                }
              </div>

              <div class="py-3">
                <label class="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span class="block text-sm font-medium">Track till sessions</span>
                    <span class="block text-xs text-base-content/60">
                      Require an open till for payments and keep opening, closing, and variance
                      counts.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="cashControl"
                  />
                </label>
                <div
                  class="ml-4 mt-2 border-l-2 border-base-300 pl-4"
                  [class.opacity-40]="!cashControl.value"
                >
                  <label
                    class="flex items-center justify-between gap-4 py-2"
                    [class.cursor-pointer]="cashControl.value"
                  >
                    <span>
                      <span class="block text-sm font-medium">Require opening count</span>
                      <span class="block text-xs text-base-content/60">
                        Count cash in the drawer before a till can be used.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      class="toggle toggle-primary"
                      [formControl]="requireOpening"
                      [attr.disabled]="!cashControl.value ? '' : null"
                    />
                  </label>
                  @if (cashControl.value && !requireOpening.value) {
                    <p class="flex items-start gap-1.5 pb-1 text-xs text-info">
                      <app-icon name="heroInformationCircle" size="sm" />
                      <span>
                        Tills will open immediately using current balances; closing counts still
                        apply.
                      </span>
                    </p>
                  }
                </div>
              </div>

              <div class="flex items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Proforma validity</span>
                  <span class="block text-xs text-base-content/60">
                    Applies to newly created proformas. Default: 30 days.
                  </span>
                </span>
                <label class="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    class="input input-bordered input-sm w-20 text-right"
                    [formControl]="proformaValidityDays"
                  />
                  <span class="text-xs text-base-content/60">days</span>
                </label>
              </div>
            </div>

            @if (dirty()) {
              <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="discard()"
                >
                  Discard
                </button>
                <button appButton type="submit" [loading]="busy()">Save changes</button>
              </div>
            }
          </form>
          @if (message(); as message) {
            <p
              class="mt-2 text-sm"
              [class.text-success]="message.ok"
              [class.text-error]="!message.ok"
            >
              {{ message.text }}
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class PosCashSettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly cashierSession = inject(CashierSessionService);

  protected readonly loading = this.companySettings.loading;
  protected readonly loadError = this.companySettings.error;
  protected readonly settings = this.companySettings.settings;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly enablePrinter = new FormControl(false, { nonNullable: true });
  protected readonly proformaValidityDays = new FormControl(30, { nonNullable: true });
  protected readonly cashierFlow = new FormControl(false, { nonNullable: true });
  protected readonly cashControl = new FormControl(false, { nonNullable: true });
  protected readonly requireOpening = new FormControl(false, { nonNullable: true });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const settings = await this.companySettings.load();
      this.applySettings(settings);
    } catch {
      // The shared store owns the visible load error.
    }
  }

  protected dirty(): boolean {
    return this.controls().some(control => control.dirty);
  }

  protected discard(): void {
    const current = this.settings();
    if (!current) return;
    this.applySettings(current);
    this.message.set(null);
  }

  protected async save(): Promise<void> {
    const validityDays = this.proformaValidityDays.value;
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
      this.message.set({
        ok: false,
        text: 'Proforma validity must be between 1 and 3650 days',
      });
      return;
    }
    this.busy.set(true);
    this.message.set(null);
    try {
      const settings = await this.companySettings.update({
        enable_printer: this.enablePrinter.value,
        proforma_validity_days: validityDays,
        cashier_flow_enabled: this.cashierFlow.value,
        cash_control_enabled: this.cashControl.value,
        require_opening_count: this.requireOpening.value,
      });
      this.applySettings(settings);
      await this.cashierSession.refreshConfiguration();
      this.message.set({ ok: true, text: 'Saved' });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Save failed',
      });
    } finally {
      this.busy.set(false);
    }
  }

  private applySettings(settings: CompanySettings): void {
    this.enablePrinter.setValue(settings.enable_printer);
    this.proformaValidityDays.setValue(settings.proforma_validity_days);
    this.cashierFlow.setValue(settings.cashier_flow_enabled);
    this.cashControl.setValue(settings.cash_control_enabled);
    this.requireOpening.setValue(settings.require_opening_count);
    for (const control of this.controls()) {
      control.markAsPristine();
    }
  }

  private controls(): Array<FormControl<boolean> | FormControl<number>> {
    return [
      this.enablePrinter,
      this.proformaValidityDays,
      this.cashierFlow,
      this.cashControl,
      this.requireOpening,
    ];
  }
}
