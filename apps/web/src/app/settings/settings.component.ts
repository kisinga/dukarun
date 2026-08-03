import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatKes, formatKesInput, parseKesToCents } from '../core/money';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import {
  CompanySettings,
  PaymentMethodRow,
  SettingsService,
  StockLocationRow,
} from './settings.service';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../shared/ui/icon.component';

type SectionKey = 'profile' | 'pos' | 'inventory' | 'cash';

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    ButtonComponent,
    DeleteConfirmationModalComponent,
    IconComponent,
  ],
  template: `
    <app-page title="Settings">
      @if (loadError()) {
        <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
      }

      @if (perms.has('ViewAuditTrail')) {
        <a
          routerLink="/settings/audit-trail"
          class="card mb-4 flex min-h-11 flex-row items-center gap-3 bg-base-100 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/60"
          >
            <app-icon name="heroClipboardDocumentList" size="lg" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">Audit trail</span>
            <span class="block text-sm text-base-content/60"
              >See who changed sales, stock, team access, cash control, and settings.</span
            >
          </span>
          <app-icon name="heroChevronRight" class="text-base-content/40" />
        </a>
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
                <input type="checkbox" class="checkbox checkbox-sm" [formControl]="enablePrinter" />
                <span class="label-text">Enable receipt printing</span>
              </label>
              <label class="label cursor-pointer justify-start gap-2 py-0">
                <input type="checkbox" class="checkbox checkbox-sm" [formControl]="cashierFlow" />
                <span class="label-text">Cashier flow (send sales to cashier)</span>
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
              <label class="form-control mt-2 w-full sm:w-64">
                <span class="label-text">Proforma validity (days)</span>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  class="input input-bordered input-sm"
                  [formControl]="proformaValidityDays"
                />
                <span class="label-text-alt text-base-content/60">
                  Applies to newly created proformas. Default: 30 days.
                </span>
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

        <!-- Locations -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="card-title text-lg">Stock locations</h2>
                  @if (entitlements.snapshot(); as plan) {
                    <span class="badge badge-outline badge-sm">{{
                      plan.tierName ?? 'No plan'
                    }}</span>
                  }
                </div>
                <p class="type-caption mt-1">
                  Locations separate where purchases are received and stock is held.
                  @if (locationLimit(); as limit) {
                    {{ locations().length }} of {{ limit }} used.
                  }
                </p>
              </div>
              @if (perms.has('ManageStockAdjustments')) {
                <button
                  appButton
                  variant="outline"
                  [disabled]="!canAddLocation()"
                  (click)="startLocationCreate()"
                >
                  Add location
                </button>
              }
            </div>

            @if (!entitlements.enabled('multipleLocations') && locations().length > 0) {
              <div class="alert mt-3 border border-info/20 bg-info/5 text-sm">
                <span class="flex-1">
                  Multiple locations are not included in your current plan. You can still rename and
                  maintain the default location.
                </span>
                <a routerLink="/billing" class="link whitespace-nowrap font-semibold">View plans</a>
              </div>
            } @else if (!canAddLocation() && locationLimit() !== null) {
              <div class="alert mt-3 border border-warning/20 bg-warning/5 text-sm">
                <span class="flex-1">Your plan's stock-location limit has been reached.</span>
                <a routerLink="/billing" class="link whitespace-nowrap font-semibold">Upgrade</a>
              </div>
            }

            @if (locationFormOpen()) {
              <form
                (submit)="$event.preventDefault(); saveLocation()"
                class="mt-3 grid gap-3 rounded-box border border-base-300 bg-base-200/40 p-3 sm:grid-cols-2"
              >
                <label class="form-control">
                  <span class="label-text">Location name</span>
                  <input class="input input-bordered input-sm" [formControl]="locationName" />
                </label>
                <label class="form-control">
                  <span class="label-text">Code</span>
                  <input
                    class="input input-bordered input-sm uppercase"
                    placeholder="e.g. WESTLANDS"
                    [formControl]="locationCode"
                  />
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-0 sm:col-span-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [formControl]="locationDefault"
                  />
                  <span class="label-text">Use as the default receiving location</span>
                </label>
                <div class="flex gap-2 sm:col-span-2">
                  <button
                    appButton
                    type="submit"
                    [loading]="locationBusy()"
                    [disabled]="
                      locationName.value.trim().length === 0 ||
                      locationCode.value.trim().length === 0
                    "
                  >
                    {{ editingLocation() ? 'Save location' : 'Create location' }}
                  </button>
                  <button appButton variant="ghost" type="button" (click)="closeLocationForm()">
                    Cancel
                  </button>
                </div>
              </form>
            }

            @if (locationMessage(); as message) {
              <p
                class="mt-2 text-sm"
                [class.text-success]="message.ok"
                [class.text-error]="!message.ok"
              >
                {{ message.text }}
              </p>
            }

            <div class="table-scroll mt-3">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (location of locations(); track location.id) {
                    <tr>
                      <td class="font-medium">{{ location.name }}</td>
                      <td class="font-mono text-xs">{{ location.code }}</td>
                      <td>
                        @if (location.is_default) {
                          <span class="badge badge-primary badge-sm">Default</span>
                        } @else {
                          <span class="badge badge-ghost badge-sm">Additional</span>
                        }
                      </td>
                      <td class="whitespace-nowrap text-right">
                        @if (perms.has('ManageStockAdjustments')) {
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            (click)="startLocationEdit(location)"
                          >
                            Edit
                          </button>
                          @if (!location.is_default) {
                            <button
                              appButton
                              variant="error"
                              size="sm"
                              (click)="startLocationDelete(location)"
                            >
                              Delete
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
                  inputmode="numeric"
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
            <div class="flex items-center justify-between">
              <h2 class="card-title text-lg">Payment methods</h2>
              <a routerLink="/billing" class="btn btn-outline btn-sm min-h-11">
                Billing &amp; plan →
              </a>
            </div>
            <div class="table-scroll">
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
            </div>
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

      <app-delete-confirmation-modal
        [data]="locationDeleteData()"
        title="Delete stock location?"
        entityType="location"
        verb="delete"
        confirmButtonText="Delete location"
        (confirm)="confirmLocationDelete()"
        (cancel)="deletingLocation.set(null)"
      />
    </app-page>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);

  protected readonly fmt = formatKes;
  protected readonly settings = signal<CompanySettings | null>(null);
  protected readonly paymentMethods = signal<PaymentMethodRow[]>([]);
  protected readonly locations = signal<StockLocationRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly messages = signal<Map<string, { ok: boolean; text: string }>>(new Map());
  protected readonly pmMsg = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly locationMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly locationBusy = signal(false);
  protected readonly locationFormOpen = signal(false);
  protected readonly editingLocation = signal<StockLocationRow | null>(null);
  protected readonly deletingLocation = signal<StockLocationRow | null>(null);
  protected readonly locationLimit = computed(() => this.entitlements.limit('maxStockLocations'));
  protected readonly canAddLocation = computed(() => {
    if (this.locations().length === 0) return true;
    if (!this.entitlements.enabled('multipleLocations')) return false;
    const limit = this.locationLimit();
    return limit === null || this.locations().length < limit;
  });
  protected readonly locationDeleteData = computed(() => ({
    entityName: this.deletingLocation()?.name ?? 'location',
    warningDetails: ['Locations with inventory or purchase history cannot be deleted.'],
  }));
  private readonly locationDeleteModal = viewChild(DeleteConfirmationModalComponent);

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly slug = new FormControl('', { nonNullable: true });
  protected readonly whatsapp = new FormControl('', { nonNullable: true });
  protected readonly storefrontEnabled = new FormControl(false, { nonNullable: true });

  protected readonly enablePrinter = new FormControl(false, { nonNullable: true });
  protected readonly proformaValidityDays = new FormControl(30, { nonNullable: true });
  protected readonly cashierFlow = new FormControl(false, { nonNullable: true });
  protected readonly cashControl = new FormControl(false, { nonNullable: true });
  protected readonly requireOpening = new FormControl(false, { nonNullable: true });

  protected readonly lowStock = new FormControl(0, { nonNullable: true });
  protected readonly batchExpiry = new FormControl(false, { nonNullable: true });

  protected readonly varianceThreshold = new FormControl('', { nonNullable: true });
  protected readonly locationName = new FormControl('', { nonNullable: true });
  protected readonly locationCode = new FormControl('', { nonNullable: true });
  protected readonly locationDefault = new FormControl(false, { nonNullable: true });

  async ngOnInit(): Promise<void> {
    try {
      const [settings, methods, locations] = await Promise.all([
        this.settingsService.getSettings(),
        this.settingsService.paymentMethods(),
        this.settingsService.stockLocations(),
        this.entitlements.refresh(),
      ]);
      this.settings.set(settings);
      this.paymentMethods.set(methods);
      this.locations.set(locations);
      this.name.setValue(settings.name);
      this.slug.setValue(settings.public_slug ?? '');
      this.whatsapp.setValue(settings.public_whatsapp_number ?? '');
      this.storefrontEnabled.setValue(settings.public_storefront_enabled);
      this.enablePrinter.setValue(settings.enable_printer);
      this.proformaValidityDays.setValue(settings.proforma_validity_days);
      this.cashierFlow.setValue(settings.cashier_flow_enabled);
      this.cashControl.setValue(settings.cash_control_enabled);
      this.requireOpening.setValue(settings.require_opening_count);
      this.lowStock.setValue(settings.low_stock_threshold);
      this.batchExpiry.setValue(settings.batch_expiry_enabled);
      this.varianceThreshold.setValue(formatKesInput(settings.variance_notification_threshold));
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }

  protected startLocationCreate(): void {
    if (!this.canAddLocation()) return;
    this.editingLocation.set(null);
    this.locationName.setValue('');
    this.locationCode.setValue('');
    this.locationDefault.setValue(false);
    this.locationMessage.set(null);
    this.locationFormOpen.set(true);
  }

  protected startLocationEdit(location: StockLocationRow): void {
    this.editingLocation.set(location);
    this.locationName.setValue(location.name);
    this.locationCode.setValue(location.code);
    this.locationDefault.setValue(location.is_default);
    this.locationMessage.set(null);
    this.locationFormOpen.set(true);
  }

  protected closeLocationForm(): void {
    this.locationFormOpen.set(false);
    this.editingLocation.set(null);
  }

  protected async saveLocation(): Promise<void> {
    const name = this.locationName.value.trim();
    const code = this.locationCode.value.trim();
    if (!name || !code) return;
    this.locationBusy.set(true);
    this.locationMessage.set(null);
    try {
      const editing = this.editingLocation();
      if (editing) {
        await this.settingsService.updateStockLocation(
          editing.id,
          code,
          name,
          this.locationDefault.value
        );
      } else {
        await this.settingsService.createStockLocation(code, name, this.locationDefault.value);
      }
      await this.reloadLocations();
      this.closeLocationForm();
      this.locationMessage.set({
        ok: true,
        text: editing ? 'Location updated' : 'Location created',
      });
    } catch (err) {
      this.locationMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Location save failed',
      });
    } finally {
      this.locationBusy.set(false);
    }
  }

  protected startLocationDelete(location: StockLocationRow): void {
    this.deletingLocation.set(location);
    this.locationDeleteModal()?.show();
  }

  protected async confirmLocationDelete(): Promise<void> {
    const location = this.deletingLocation();
    if (!location) return;
    this.locationBusy.set(true);
    this.locationMessage.set(null);
    try {
      await this.settingsService.deleteStockLocation(location.id);
      this.locationDeleteModal()?.hide();
      this.deletingLocation.set(null);
      await this.reloadLocations();
      this.locationMessage.set({ ok: true, text: 'Location deleted' });
    } catch (err) {
      this.locationMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Location delete failed',
      });
    } finally {
      this.locationBusy.set(false);
    }
  }

  private async reloadLocations(): Promise<void> {
    const [locations] = await Promise.all([
      this.settingsService.stockLocations(),
      this.entitlements.refresh(),
    ]);
    this.locations.set(locations);
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
        if (
          !Number.isInteger(this.proformaValidityDays.value) ||
          this.proformaValidityDays.value < 1 ||
          this.proformaValidityDays.value > 3650
        ) {
          this.flash('pos', false, 'Proforma validity must be between 1 and 3650 days');
          return;
        }
        patch = {
          enable_printer: this.enablePrinter.value,
          proforma_validity_days: this.proformaValidityDays.value,
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
