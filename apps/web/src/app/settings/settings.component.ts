import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../core/money';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { CompanySettings, PaymentMethodRow, SettingsService } from './settings.service';

type SectionKey = 'profile' | 'pos' | 'inventory' | 'cash';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, PageHeaderComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-3xl">
        <app-page-header title="Settings" backLink="/dashboard" backLabel="Dashboard" />

        @if (loadError()) {
          <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
        }

        @if (settings(); as s) {
          <!-- Profile -->
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Profile</h2>
              <form
                (submit)="$event.preventDefault(); saveSection('profile')"
                class="mt-2 grid gap-3 sm:grid-cols-2"
              >
                <label class="form-control">
                  <span class="label-text">Company name</span>
                  <input type="text" class="input input-bordered input-sm" [formControl]="name" />
                </label>
                <label class="form-control">
                  <span class="label-text">Public slug</span>
                  <input type="text" class="input input-bordered input-sm" [formControl]="slug" />
                </label>
                <p class="type-caption sm:col-span-2">
                  Storefront fields are used by your public storefront (launching separately).
                </p>
                <label class="form-control">
                  <span class="label-text">WhatsApp number (storefront)</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="+254…"
                    [formControl]="whatsapp"
                  />
                </label>
                <label class="label cursor-pointer justify-start gap-2 self-end">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="storefrontEnabled"
                  />
                  <span class="label-text">Public storefront enabled</span>
                </label>
                <div class="sm:col-span-2">
                  @if (msg('profile'); as m) {
                    <p class="mb-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  <button type="submit" class="btn btn-primary btn-sm min-h-11" [disabled]="busy()">
                    Save profile
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- POS & cash control -->
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">POS &amp; cash control</h2>
              <form
                (submit)="$event.preventDefault(); saveSection('pos')"
                class="mt-2 flex flex-col gap-2"
              >
                <label class="label cursor-pointer justify-start gap-2 py-0">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="enablePrinter"
                  />
                  <span class="label-text">Enable receipt printing</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-0">
                  <input type="checkbox" class="checkbox checkbox-sm" [formControl]="cashierFlow" />
                  <span class="label-text">Cashier flow (park to cashier queue)</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-0">
                  <input type="checkbox" class="checkbox checkbox-sm" [formControl]="cashControl" />
                  <span class="label-text">Cash control</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-0">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="requireOpening"
                  />
                  <span class="label-text">Require opening count</span>
                </label>
                <div>
                  @if (msg('pos'); as m) {
                    <p class="mb-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  <button type="submit" class="btn btn-primary btn-sm min-h-11" [disabled]="busy()">
                    Save POS settings
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Inventory -->
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Inventory</h2>
              <form
                (submit)="$event.preventDefault(); saveSection('inventory')"
                class="mt-2 flex flex-wrap items-end gap-3"
              >
                <label class="form-control w-40">
                  <span class="label-text">Low-stock threshold</span>
                  <input
                    type="number"
                    min="0"
                    class="input input-bordered input-sm"
                    [formControl]="lowStock"
                  />
                </label>
                <label class="label cursor-pointer justify-start gap-2">
                  <input type="checkbox" class="checkbox checkbox-sm" [formControl]="batchExpiry" />
                  <span class="label-text">Track batch expiry</span>
                </label>
                <div class="w-full">
                  @if (msg('inventory'); as m) {
                    <p class="mb-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  <button type="submit" class="btn btn-primary btn-sm min-h-11" [disabled]="busy()">
                    Save inventory
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Cash control threshold -->
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Variance notifications</h2>
              <p class="type-caption">
                Flag drawer variances at or above this amount (currently
                {{ fmt(s.variance_notification_threshold) }}).
              </p>
              <form
                (submit)="$event.preventDefault(); saveSection('cash')"
                class="mt-2 flex flex-wrap items-end gap-3"
              >
                <label class="form-control w-40">
                  <span class="label-text">Threshold (KES)</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-sm"
                    [formControl]="varianceThreshold"
                  />
                </label>
                <div>
                  @if (msg('cash'); as m) {
                    <p class="mb-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  <button type="submit" class="btn btn-primary btn-sm min-h-11" [disabled]="busy()">
                    Save threshold
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Payment methods -->
          <div class="card mb-4 bg-base-100">
            <div class="card-body p-4">
              <h2 class="card-title text-lg">Payment methods</h2>
              <table class="table table-sm mt-2">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Enabled</th>
                    <th>Reconciliation</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (pm of paymentMethods(); track pm.code) {
                    <tr>
                      <td>
                        <span class="text-sm font-medium">{{ pm.name }}</span>
                        @if (pm.is_cashier_controlled) {
                          <span class="badge badge-xs badge-info ml-1">cashier</span>
                        }
                        <span class="ml-1 font-mono text-xs text-base-content/60">
                          {{ pm.code }}
                        </span>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          class="toggle toggle-sm"
                          [checked]="pm.enabled"
                          (change)="toggleMethod(pm, 'enabled', $event)"
                          [disabled]="busy()"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          class="toggle toggle-sm"
                          [checked]="pm.requires_reconciliation"
                          (change)="toggleMethod(pm, 'requires_reconciliation', $event)"
                          [disabled]="busy()"
                        />
                      </td>
                      <td class="type-caption">requires recon</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (pmMsg(); as m) {
                <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                  {{ m.text }}
                </p>
              }
            </div>
          </div>
        } @else {
          <p class="text-sm text-base-content/60">Loading…</p>
        }
      </div>
    </main>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);

  protected readonly fmt = formatKes;
  protected readonly settings = signal<CompanySettings | null>(null);
  protected readonly paymentMethods = signal<PaymentMethodRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly messages = signal<Map<string, { ok: boolean; text: string }>>(new Map());
  protected readonly pmMsg = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly slug = new FormControl('', { nonNullable: true });
  protected readonly whatsapp = new FormControl('', { nonNullable: true });
  protected readonly storefrontEnabled = new FormControl(false, { nonNullable: true });

  protected readonly enablePrinter = new FormControl(false, { nonNullable: true });
  protected readonly cashierFlow = new FormControl(false, { nonNullable: true });
  protected readonly cashControl = new FormControl(false, { nonNullable: true });
  protected readonly requireOpening = new FormControl(false, { nonNullable: true });

  protected readonly lowStock = new FormControl(0, { nonNullable: true });
  protected readonly batchExpiry = new FormControl(false, { nonNullable: true });

  protected readonly varianceThreshold = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    try {
      const [settings, methods] = await Promise.all([
        this.settingsService.getSettings(),
        this.settingsService.paymentMethods(),
      ]);
      this.settings.set(settings);
      this.paymentMethods.set(methods);
      this.name.setValue(settings.name);
      this.slug.setValue(settings.public_slug ?? '');
      this.whatsapp.setValue(settings.public_whatsapp_number ?? '');
      this.storefrontEnabled.setValue(settings.public_storefront_enabled);
      this.enablePrinter.setValue(settings.enable_printer);
      this.cashierFlow.setValue(settings.cashier_flow_enabled);
      this.cashControl.setValue(settings.cash_control_enabled);
      this.requireOpening.setValue(settings.require_opening_count);
      this.lowStock.setValue(settings.low_stock_threshold);
      this.batchExpiry.setValue(settings.batch_expiry_enabled);
      this.varianceThreshold.setValue((settings.variance_notification_threshold / 100).toFixed(2));
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }

  protected msg(key: string): { ok: boolean; text: string } | null {
    return this.messages().get(key) ?? null;
  }

  private flash(key: string, ok: boolean, text: string): void {
    this.messages.update(map => new Map(map).set(key, { ok, text }));
  }

  protected async saveSection(section: SectionKey): Promise<void> {
    const s = this.settings();
    if (!s) return;
    let patch: Partial<Omit<CompanySettings, 'id'>>;
    switch (section) {
      case 'profile':
        patch = {
          name: this.name.value.trim(),
          public_slug: this.slug.value.trim() || null,
          public_whatsapp_number: this.whatsapp.value.trim() || null,
          public_storefront_enabled: this.storefrontEnabled.value,
        };
        break;
      case 'pos':
        patch = {
          enable_printer: this.enablePrinter.value,
          cashier_flow_enabled: this.cashierFlow.value,
          cash_control_enabled: this.cashControl.value,
          require_opening_count: this.requireOpening.value,
        };
        break;
      case 'inventory':
        patch = {
          low_stock_threshold: this.lowStock.value,
          batch_expiry_enabled: this.batchExpiry.value,
        };
        break;
      case 'cash': {
        const cents = parseKesToCents(this.varianceThreshold.value);
        if (cents === null) {
          this.flash('cash', false, 'Enter a valid threshold amount');
          return;
        }
        patch = { variance_notification_threshold: cents };
        break;
      }
    }
    this.busy.set(true);
    try {
      await this.settingsService.updateSettings(s.id, patch);
      this.settings.set({ ...s, ...patch });
      this.flash(section, true, 'Saved');
    } catch (err) {
      this.flash(section, false, err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleMethod(
    pm: PaymentMethodRow,
    field: 'enabled' | 'requires_reconciliation',
    event: Event
  ): Promise<void> {
    const value = (event.target as HTMLInputElement).checked;
    this.busy.set(true);
    this.pmMsg.set(null);
    try {
      await this.settingsService.updatePaymentMethod(pm.code, { [field]: value });
      this.paymentMethods.update(list =>
        list.map(m => (m.code === pm.code ? { ...m, [field]: value } : m))
      );
      this.pmMsg.set({ ok: true, text: `${pm.name} updated` });
    } catch (err) {
      this.pmMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      this.busy.set(false);
    }
  }
}
