import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CashierSessionService } from '../core/cashier-session.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { CompanySettingsStore } from './company-settings.store';
import type { CompanySettings } from './settings.service';

@Component({
  selector: 'app-inventory-settings',
  imports: [ReactiveFormsModule, ButtonComponent, IconComponent],
  template: `
    @if (loading()) {
      <div class="card h-full bg-base-100">
        <div class="card-body gap-3 p-4">
          <div class="skeleton h-6 w-28"></div>
          <div class="skeleton h-24 w-full"></div>
        </div>
      </div>
    } @else if (loadError()) {
      <div class="card h-full bg-base-100">
        <div class="card-body gap-3 p-4">
          <h2 class="section-title">Inventory</h2>
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
              <h2 class="section-title">Inventory</h2>
              <p class="type-caption mt-1">Stock warnings and batch-expiry intake behavior.</p>
            </div>
            @if (dirty()) {
              <span class="badge badge-warning badge-sm">Unsaved changes</span>
            }
          </div>

          <form (submit)="$event.preventDefault(); save()" class="mt-1">
            <div class="divide-y divide-base-300">
              <div class="flex items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Low-stock threshold</span>
                  <span class="block text-xs text-base-content/60">
                    Warn when available stock falls to this level.
                  </span>
                </span>
                <input
                  type="number"
                  min="0"
                  class="input input-bordered input-sm w-20 text-right"
                  [formControl]="lowStock"
                />
              </div>
              <label class="flex cursor-pointer items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Track expiry dates</span>
                  <span class="block text-xs text-base-content/60">
                    Show expiry fields on stock intake and warn about batches nearing expiry.
                  </span>
                </span>
                <input type="checkbox" class="toggle toggle-primary" [formControl]="batchExpiry" />
              </label>
            </div>
            @if (!batchExpiry.value) {
              <p class="type-caption mt-2 flex items-start gap-1.5 text-info">
                <app-icon name="heroInformationCircle" size="sm" />
                <span>Expiry fields are hidden. Existing expiry history is retained.</span>
              </p>
            }
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
export class InventorySettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly cashierSession = inject(CashierSessionService);

  protected readonly loading = this.companySettings.loading;
  protected readonly loadError = this.companySettings.error;
  protected readonly settings = this.companySettings.settings;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly lowStock = new FormControl(0, { nonNullable: true });
  protected readonly batchExpiry = new FormControl(false, { nonNullable: true });

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
    this.busy.set(true);
    this.message.set(null);
    try {
      const settings = await this.companySettings.update({
        low_stock_threshold: this.lowStock.value,
        batch_expiry_enabled: this.batchExpiry.value,
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
    this.lowStock.setValue(settings.low_stock_threshold);
    this.batchExpiry.setValue(settings.batch_expiry_enabled);
    for (const control of this.controls()) {
      control.markAsPristine();
    }
  }

  private controls(): Array<FormControl<number> | FormControl<boolean>> {
    return [this.lowStock, this.batchExpiry];
  }
}
