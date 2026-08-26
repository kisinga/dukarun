import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatKesInput, parseKes } from '../core/money';
import { reconciliationLabel } from '../core/payment-methods';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { MoneyComponent } from '../shared/ui/money.component';
import {
  CompanySettings,
  PaymentMethodRow,
  LocationPaymentMethodRow,
  MoneyAccountRow,
  PrimaryContactNotificationChannel,
  PrimaryContactNotificationSettings,
  SettingsService,
  StockLocationRow,
} from './settings.service';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../shared/ui/icon.component';
import { CashierSessionService } from '../core/cashier-session.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { imageExtension, resizeImage } from '../shared/ui/image.util';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PartyCacheService } from '../core/party-cache.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';
import { ProductImportDialogComponent } from '../products/product-import-dialog.component';
import {
  ProductTransferService,
  type ProductWorkbookResult,
} from '../products/product-transfer.service';
import { CachedDataExportService, type CachedExportKind } from './cached-data-export.service';
import { TaxSettingsComponent } from './tax-settings.component';
import { MpesaSettingsComponent } from './mpesa-settings.component';
import { FulfillmentSettingsComponent } from './fulfillment-settings.component';

type SectionKey = 'profile' | 'pos' | 'inventory' | 'cash';
type SettingsTab =
  'business' | 'operations' | 'fulfillment' | 'money' | 'mpesa' | 'communications' | 'data';
type ReminderDraft = {
  stageDays: number;
  enabled: boolean;
  key: string;
};

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SETTINGS_TABS: ReadonlyArray<{ key: SettingsTab; label: string; description: string }> = [
  {
    key: 'business',
    label: 'Business',
    description: 'Your business identity, contact details and public storefront.',
  },
  {
    key: 'operations',
    label: 'Operations',
    description: 'Checkout, till, inventory and stock-location rules.',
  },
  {
    key: 'fulfillment',
    label: 'Pickup & Delivery',
    description: 'Pickup, delivery, COD, tracking and promise settings by location.',
  },
  {
    key: 'money',
    label: 'Money',
    description: 'Tax, reconciliation, payment accounts and financial controls.',
  },
  {
    key: 'mpesa',
    label: 'M-PESA',
    description: 'Connect and monitor your M-PESA merchant account.',
  },
  {
    key: 'communications',
    label: 'Notifications',
    description: 'Choose which operational and customer alerts are sent.',
  },
  {
    key: 'data',
    label: 'Data',
    description: 'Move business data in and out of Dukarun safely.',
  },
];

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    ButtonComponent,
    DeleteConfirmationModalComponent,
    IconComponent,
    FormFieldComponent,
    MoneyComponent,
    MobileListComponent,
    ProductImportDialogComponent,
    TaxSettingsComponent,
    MpesaSettingsComponent,
    FulfillmentSettingsComponent,
  ],
  template: `
    <app-page title="Settings" subtitle="Manage how Dukarun works for this business." [wide]="true">
      @if (loadError()) {
        <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
      }

      @if (settings(); as s) {
        <div class="space-y-4">
          <label class="form-control md:hidden">
            <span
              class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
            >
              Settings section
            </span>
            <select
              class="select select-bordered min-h-11 w-full"
              aria-label="Settings section"
              [ngModel]="activeTab()"
              (ngModelChange)="selectTabFromValue($event)"
            >
              @for (tab of settingsTabs(); track tab.key) {
                <option [value]="tab.key">{{ tab.label }}</option>
              }
            </select>
          </label>
          <nav class="hidden md:block" aria-label="Settings sections">
            <div role="tablist" class="section-tabs">
              @for (tab of settingsTabs(); track tab.key) {
                <button
                  role="tab"
                  type="button"
                  class="section-tab"
                  [class.section-tab-active]="activeTab() === tab.key"
                  [attr.aria-selected]="activeTab() === tab.key"
                  (click)="selectTab(tab.key)"
                >
                  {{ tab.label }}
                </button>
              }
            </div>
          </nav>

          <header class="border-b border-base-300/60 pb-3">
            <h2 class="type-heading">{{ activeTabMeta().label }}</h2>
            <p class="type-caption mt-1">{{ activeTabMeta().description }}</p>
          </header>

          @if (activeTab() === 'business') {
            <!-- Profile -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <h2 class="section-title">Profile</h2>

                <!-- Company logo -->
                <div class="mt-2 flex items-center gap-3">
                  @if (s.logo_path) {
                    <img
                      [src]="logoUrl(s.logo_path)"
                      alt="Company logo"
                      class="h-14 w-14 rounded-box border border-base-300 object-contain"
                    />
                  }
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      [loading]="logoBusy()"
                      (click)="logoInput.click()"
                    >
                      {{ s.logo_path ? 'Change logo' : 'Upload logo' }}
                    </button>
                    @if (s.logo_path) {
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        [disabled]="logoBusy()"
                        (click)="removeLogo()"
                      >
                        Remove logo
                      </button>
                    }
                    <input
                      #logoInput
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      class="hidden"
                      (change)="onLogoSelected($event)"
                    />
                  </div>
                </div>
                <p class="type-caption mt-1">
                  JPEG, PNG, WebP or SVG up to 2 MB. Shown on receipts and invoices.
                </p>
                @if (logoMsg(); as m) {
                  <p class="mt-1 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }

                <form
                  (submit)="$event.preventDefault(); saveSection('profile')"
                  class="mt-2 grid gap-3 sm:grid-cols-2"
                >
                  <app-form-field label="Company name" [required]="true">
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      [formControl]="name"
                    />
                  </app-form-field>
                  <app-form-field
                    label="Public slug"
                    hint="Lowercase letters, numbers, and single hyphens only."
                    [error]="slug.invalid && slug.touched ? 'Enter a valid public slug.' : null"
                  >
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      [formControl]="slug"
                      maxlength="63"
                      autocapitalize="none"
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </app-form-field>
                  <app-form-field label="Business email">
                    <input
                      type="email"
                      class="input input-bordered input-sm w-full"
                      [formControl]="email"
                    />
                  </app-form-field>
                  <app-form-field label="Business address" class="sm:col-span-2">
                    <textarea
                      rows="2"
                      class="textarea textarea-bordered textarea-sm w-full"
                      [formControl]="address"
                    ></textarea>
                  </app-form-field>
                  <p class="type-caption sm:col-span-2">
                    Shown on A4 invoices and receipts headers.
                  </p>
                  <p class="type-caption sm:col-span-2">
                    Storefront fields are used by your public storefront (launching separately).
                  </p>
                  <app-form-field label="WhatsApp number (storefront)">
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      placeholder="+254…"
                      [formControl]="whatsapp"
                    />
                  </app-form-field>
                  <label class="label cursor-pointer justify-start gap-2 self-end">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="storefrontEnabled"
                      [attr.disabled]="!entitlements.enabled('storefront') ? '' : null"
                    />
                    <span class="label-text">Public storefront enabled</span>
                  </label>
                  @if (!entitlements.enabled('storefront')) {
                    <p class="type-caption text-warning sm:col-span-2">
                      Storefront publishing is unavailable on this plan.
                      <a routerLink="/billing" class="link">View plans</a>
                    </p>
                  }
                  <div class="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
                    @if (sectionDirty('profile')) {
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        [disabled]="busy()"
                        (click)="discardSection('profile')"
                      >
                        Discard
                      </button>
                      <button appButton type="submit" [loading]="busy()">Save changes</button>
                    }
                  </div>
                </form>
                @if (msg('profile'); as m) {
                  <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }
              </div>
            </div>
          }

          @if (activeTab() === 'operations') {
            <div class="grid gap-4 xl:grid-cols-3">
              <!-- POS & cash control -->
              <div class="card bg-base-100 xl:col-span-2 @container">
                <div class="card-body p-4">
                  <h2 class="section-title">POS &amp; cash control</h2>
                  <form (submit)="$event.preventDefault(); saveSection('pos')" class="mt-1">
                    <div class="grid gap-x-6 @3xl:grid-cols-2">
                      <div class="divide-y divide-base-300">
                        <!-- Receipt printing -->
                        <label class="flex cursor-pointer items-center justify-between gap-4 py-3">
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

                        <!-- Cashier queue -->
                        <div class="py-3">
                          <label class="flex cursor-pointer items-center justify-between gap-4">
                            <span>
                              <span class="block text-sm font-medium"
                                >Use a separate cashier queue</span
                              >
                              <span class="block text-xs text-base-content/60">
                                When off, sellers take payment and complete orders directly on the
                                Sell screen.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              class="toggle toggle-primary"
                              [formControl]="cashierFlow"
                            />
                          </label>
                          @if (!cashierFlow.value) {
                            <p class="mt-1.5 flex items-center gap-1 text-xs text-info">
                              <app-icon name="heroInformationCircle" size="sm" />
                              Direct checkout will be used. New orders will not enter a cashier
                              queue.
                            </p>
                          }
                        </div>
                      </div>

                      <div
                        class="divide-y divide-base-300 border-t border-base-300 @3xl:border-t-0"
                      >
                        <!-- Till sessions -->
                        <div class="py-3">
                          <label class="flex cursor-pointer items-center justify-between gap-4">
                            <span>
                              <span class="block text-sm font-medium">Track till sessions</span>
                              <span class="block text-xs text-base-content/60">
                                Require an open till for payments and keep opening, closing, and
                                variance counts.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              class="toggle toggle-primary"
                              [formControl]="cashControl"
                            />
                          </label>
                          <div
                            class="ml-4 mt-1 border-l-2 border-base-300 pl-4"
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
                              <p class="flex items-center gap-1 pb-1 text-xs text-info">
                                <app-icon name="heroInformationCircle" size="sm" />
                                Tills will open immediately using current balances; closing counts
                                still apply.
                              </p>
                            }
                          </div>
                        </div>

                        <!-- Proforma validity -->
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
                    </div>

                    @if (sectionDirty('pos')) {
                      <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                        <button
                          appButton
                          variant="ghost"
                          type="button"
                          [disabled]="busy()"
                          (click)="discardSection('pos')"
                        >
                          Discard
                        </button>
                        <button appButton type="submit" [loading]="busy()">Save changes</button>
                      </div>
                    }
                  </form>
                  @if (msg('pos'); as m) {
                    <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                </div>
              </div>

              <!-- Inventory -->
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <h2 class="section-title">Inventory</h2>
                  <form (submit)="$event.preventDefault(); saveSection('inventory')" class="mt-1">
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
                            Show expiry fields on stock intake and warn about batches nearing
                            expiry.
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          class="toggle toggle-primary"
                          [formControl]="batchExpiry"
                        />
                      </label>
                    </div>
                    @if (!batchExpiry.value) {
                      <p class="type-caption mt-2 flex items-start gap-1.5 text-info">
                        <app-icon name="heroInformationCircle" size="sm" />
                        <span>Expiry fields are hidden. Existing expiry history is retained.</span>
                      </p>
                    }
                    @if (sectionDirty('inventory')) {
                      <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                        <button
                          appButton
                          variant="ghost"
                          type="button"
                          [disabled]="busy()"
                          (click)="discardSection('inventory')"
                        >
                          Discard
                        </button>
                        <button appButton type="submit" [loading]="busy()">Save changes</button>
                      </div>
                    }
                  </form>
                  @if (msg('inventory'); as m) {
                    <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                </div>
              </div>
            </div>

            <!-- Locations -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="section-title">Stock locations</h2>
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
                      class="shrink-0"
                      [disabled]="!canAddLocation()"
                      (click)="startLocationCreate()"
                    >
                      <app-icon name="heroPlus" />
                      Add location
                    </button>
                  }
                </div>

                @if (!entitlements.enabled('multipleLocations') && locations().length > 0) {
                  <div class="alert alert-info mt-3 text-sm">
                    <app-icon name="heroInformationCircle" />
                    <span class="flex-1">
                      Multiple locations are not included in your current plan. You can still rename
                      and maintain the default location.
                    </span>
                    <a routerLink="/billing" class="link whitespace-nowrap font-semibold"
                      >View plans</a
                    >
                  </div>
                } @else if (!canAddLocation() && locationLimit() !== null) {
                  <div class="alert alert-warning mt-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span class="flex-1">Your plan's stock-location limit has been reached.</span>
                    <a routerLink="/billing" class="link whitespace-nowrap font-semibold"
                      >Upgrade</a
                    >
                  </div>
                }

                @if (locationFormOpen()) {
                  <form
                    (submit)="$event.preventDefault(); saveLocation()"
                    class="mt-3 grid gap-3 border-t border-base-300 pt-3 sm:grid-cols-2"
                  >
                    <app-form-field label="Location name" [required]="true">
                      <input
                        class="input input-bordered input-sm w-full"
                        [formControl]="locationName"
                      />
                    </app-form-field>
                    <app-form-field
                      label="Code"
                      [required]="true"
                      hint="Short uppercase code, e.g. WESTLANDS"
                    >
                      <input
                        class="input input-bordered input-sm w-full uppercase"
                        placeholder="e.g. WESTLANDS"
                        [formControl]="locationCode"
                      />
                    </app-form-field>
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

                <app-mobile-list class="mt-3">
                  @for (location of locations(); track location.id) {
                    <div mobileListRow class="p-3">
                      <div class="flex items-center gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="truncate font-semibold">{{ location.name }}</p>
                            @if (location.is_default) {
                              <span class="badge badge-primary badge-xs">Default</span>
                            }
                          </div>
                          <p class="type-caption mt-1 font-mono">{{ location.code }}</p>
                        </div>
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
                      </div>
                    </div>
                  }
                </app-mobile-list>
                <div class="mt-3 hidden lg:block">
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
          }

          @if (activeTab() === 'fulfillment') {
            <app-fulfillment-settings />
          }

          @if (activeTab() === 'mpesa') {
            <app-mpesa-settings />
          }

          @if (activeTab() === 'money') {
            <app-tax-settings />

            <!-- Cash control threshold -->
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <h2 class="section-title">Variance notifications</h2>
                <p class="type-caption mt-1">
                  Flag drawer variances at or above
                  <app-money [amount]="s.variance_notification_threshold" [showCurrency]="true" />.
                </p>
                @if (!cashControl.value) {
                  <p class="type-caption mt-2 flex items-start gap-1.5 text-info">
                    <app-icon name="heroInformationCircle" size="sm" />
                    <span>This takes effect when till-session cash control is enabled.</span>
                  </p>
                }
                <form
                  (submit)="$event.preventDefault(); saveSection('cash')"
                  class="mt-3 flex flex-wrap items-end gap-2"
                >
                  <app-form-field label="Threshold (KES)" class="w-40">
                    <input
                      type="text"
                      inputmode="numeric"
                      class="input input-bordered input-sm w-full"
                      [formControl]="varianceThreshold"
                    />
                  </app-form-field>
                  @if (sectionDirty('cash')) {
                    <button
                      appButton
                      variant="ghost"
                      type="button"
                      [disabled]="busy()"
                      (click)="discardSection('cash')"
                    >
                      Discard
                    </button>
                    <button appButton type="submit" [loading]="busy()">Save changes</button>
                  }
                </form>
                @if (msg('cash'); as m) {
                  <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }
              </div>
            </div>
          }

          <!-- Commissions -->
          @if (
            activeTab() === 'money' &&
            entitlements.enabled('commissions') &&
            perms.has('ManageCommissions')
          ) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 class="section-title">Commissions</h2>
                    <p class="type-caption mt-1">
                      Optional staff commission plans and reviewable statements.
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    @if (s.commissions_enabled) {
                      <a appButton variant="ghost" size="sm" routerLink="/team/commissions">
                        Manage commissions
                      </a>
                    }
                    <label class="label cursor-pointer gap-3">
                      <span class="label-text font-medium">Enable commissions</span>
                      <input
                        type="checkbox"
                        class="toggle toggle-primary"
                        [checked]="s.commissions_enabled"
                        [disabled]="busy()"
                        (change)="toggleCommissions($event)"
                      />
                    </label>
                  </div>
                </div>
                @if (msg('commissions'); as m) {
                  <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }
              </div>
            </div>
          }

          @if (activeTab() === 'communications' && perms.has('ManageTeam')) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 class="section-title">Primary contact alerts</h2>
                    <p class="type-caption mt-1">
                      Choose how operational alerts reach the company’s primary contact. Every alert
                      also stays in their Dukarun inbox.
                    </p>
                  </div>
                  <a appButton variant="ghost" size="sm" routerLink="/team">
                    Manage primary contact
                  </a>
                </div>

                @if (primaryContactSettings(); as primary) {
                  @if (primary.primary_contact_user_id) {
                    <div
                      class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200/40 px-3 py-2"
                    >
                      <div>
                        <p class="text-sm font-semibold">
                          {{ primary.primary_contact_name || 'Primary administrator' }}
                        </p>
                        <p class="type-caption">
                          {{ primary.primary_contact_phone || 'No verified phone available' }}
                        </p>
                      </div>
                      <span class="badge badge-primary badge-sm">Primary contact</span>
                    </div>

                    <div class="mt-4 grid gap-4 sm:grid-cols-2">
                      <app-form-field
                        label="External channel"
                        hint="SMS fallback is used only after WhatsApp permanently fails."
                      >
                        <select
                          class="select select-bordered select-sm w-full"
                          [formControl]="primaryContactChannel"
                        >
                          <option value="whatsapp_sms_fallback">WhatsApp, then SMS fallback</option>
                          <option value="whatsapp">WhatsApp only</option>
                          <option value="sms">SMS only</option>
                          <option value="none">In-app only</option>
                        </select>
                      </app-form-field>
                      <div class="divide-y divide-base-300 rounded-box bg-base-200/40 px-3">
                        <label
                          class="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
                        >
                          <span>
                            <span class="block text-sm font-medium">Team invitations</span>
                            <span class="type-caption">Invited and joined events</span>
                          </span>
                          <input
                            type="checkbox"
                            class="toggle toggle-sm toggle-primary"
                            [formControl]="primaryTeamNotifications"
                          />
                        </label>
                        <label
                          class="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
                        >
                          <span>
                            <span class="block text-sm font-medium">Cashier sessions</span>
                            <span class="type-caption">Day opened and closed summaries</span>
                          </span>
                          <input
                            type="checkbox"
                            class="toggle toggle-sm toggle-primary"
                            [formControl]="primaryCashierNotifications"
                          />
                        </label>
                      </div>
                    </div>
                    @if (msg('primary-contact-notifications'); as m) {
                      <p
                        class="mt-2 text-sm"
                        [class.text-success]="m.ok"
                        [class.text-error]="!m.ok"
                      >
                        {{ m.text }}
                      </p>
                    }
                    @if (primaryContactDirty()) {
                      <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                        <button
                          appButton
                          variant="ghost"
                          type="button"
                          [disabled]="busy()"
                          (click)="discardPrimaryContactNotifications()"
                        >
                          Discard
                        </button>
                        <button
                          appButton
                          type="button"
                          [loading]="busy()"
                          (click)="savePrimaryContactNotifications()"
                        >
                          Save changes
                        </button>
                      </div>
                    }
                  } @else {
                    <div class="alert alert-warning mt-4 text-sm">
                      <app-icon name="heroExclamationTriangle" />
                      <span>
                        Select an approved administrator as primary contact before enabling external
                        alerts.
                      </span>
                      <a routerLink="/team" class="link whitespace-nowrap font-semibold">
                        Choose contact
                      </a>
                    </div>
                  }
                } @else if (primaryContactLoading()) {
                  <div class="mt-4 grid gap-2" aria-label="Loading primary contact alerts">
                    <div class="skeleton h-14 w-full"></div>
                    <div class="skeleton h-10 w-full"></div>
                  </div>
                } @else if (primaryContactLoadError()) {
                  <div class="alert alert-error mt-4 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ primaryContactLoadError() }}</span>
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      (click)="reloadPrimaryContactSettings()"
                    >
                      Try again
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          @if (activeTab() === 'communications' && perms.has('ManageCommunications')) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div
                  class="flex items-start justify-between gap-4 border-b border-base-300/60 pb-4"
                >
                  <div>
                    <h2 class="section-title">Automated customer notifications</h2>
                    <p class="type-caption mt-1">
                      Controls scheduled customer messages such as payment reminders. Manually
                      reviewed receipts, invoices, proformas and purchase orders are separate.
                    </p>
                    @if (s.automated_customer_notifications_override !== null) {
                      <p class="mt-1 text-xs text-warning">
                        Dukarun has
                        {{ s.automated_customer_notifications_override ? 'enabled' : 'paused' }}
                        automation for this company.
                      </p>
                    }
                  </div>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="automatedCustomerNotificationsEnabled"
                    [disabled]="busy() || s.automated_customer_notifications_override !== null"
                    (change)="saveAutomationPreference()"
                  />
                </div>
                @if (msg('automation'); as m) {
                  <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }
                <div class="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 class="section-title">Payment reminders</h2>
                    <p class="type-caption mt-1">
                      Send due-day, 3-, 7-, and 14-day reminders automatically.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="paymentRemindersEnabled"
                    [disabled]="!entitlements.enabled('paymentReminders')"
                  />
                </div>
                @if (!entitlements.enabled('paymentReminders')) {
                  <p class="mt-3 text-sm text-warning">
                    Payment reminders are unavailable on this plan.
                    <a routerLink="/billing" class="link">View plans</a>
                  </p>
                } @else {
                  @if (paymentRemindersEnabled.value) {
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                      <app-form-field label="Default channel">
                        <select
                          class="select select-bordered select-sm w-full"
                          [formControl]="reminderChannel"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                        </select>
                      </app-form-field>
                      <label class="label cursor-pointer justify-start gap-3 self-end">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [formControl]="reminderSmsFallback"
                        />
                        <span class="label-text">Use SMS if WhatsApp permanently fails</span>
                      </label>
                      <div class="sm:col-span-2">
                        <div class="flex flex-wrap items-baseline justify-between gap-2">
                          <p class="text-sm font-medium">Reminder stages</p>
                          <p class="type-caption">Message wording is managed by Dukarun.</p>
                        </div>
                        <div class="mt-2 grid gap-1 rounded-box bg-base-200/40 p-1 sm:grid-cols-2">
                          @for (draft of reminderDrafts(); track draft.key) {
                            <label
                              class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-2 py-2"
                            >
                              <span class="font-medium">{{
                                reminderStageLabel(draft.stageDays)
                              }}</span>
                              <input
                                type="checkbox"
                                class="toggle toggle-sm toggle-primary"
                                [checked]="draft.enabled"
                                (change)="setReminderStageEnabled(draft.key, $event)"
                              />
                            </label>
                          }
                        </div>
                      </div>
                    </div>
                  } @else {
                    <p class="type-caption mt-3">
                      Reminder schedules and delivery options are paused while this is off.
                    </p>
                  }
                  @if (msg('communications'); as m) {
                    <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  @if (reminderSettingsDirty()) {
                    <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        [disabled]="busy()"
                        (click)="discardCommunicationSettings()"
                      >
                        Discard
                      </button>
                      <button
                        appButton
                        type="button"
                        [loading]="busy()"
                        (click)="saveCommunicationSettings()"
                      >
                        Save changes
                      </button>
                    </div>
                  }
                }
                <div class="mt-4 border-t border-base-300/60 pt-4">
                  <p class="type-caption">
                    Campaigns and manually reviewed documents keep their send-time channel and
                    recipient choices.
                    <a routerLink="/activity/messages" class="link font-semibold">
                      View message activity
                    </a>
                  </p>
                </div>
              </div>
            </div>
          }

          @if (activeTab() === 'money' && perms.has('ManageReconciliation')) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 class="section-title">Payment accounts</h2>
                    <p class="type-caption mt-1">
                      Checkout uses each location's default automatically. Cashiers can change it
                      when another active account is appropriate.
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      (click)="startMoneyAccount('mpesa')"
                    >
                      Add M-PESA
                    </button>
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      (click)="startMoneyAccount('bank')"
                    >
                      Add bank
                    </button>
                  </div>
                </div>

                @if (addingMoneyKind() || editingMoneyAccount()) {
                  <div class="mt-4 rounded-box border border-base-300 bg-base-200/40 p-3">
                    <p class="type-heading">
                      {{
                        editingMoneyAccount()
                          ? 'Rename account'
                          : 'Add ' + moneyKindLabel(addingMoneyKind()!) + ' account'
                      }}
                    </p>
                    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <app-form-field
                        class="flex-1"
                        label="Account name"
                        hint="Use a recognizable label, such as Equity Westlands or Till 123456."
                      >
                        <input
                          class="input input-bordered min-h-11 w-full"
                          [formControl]="moneyAccountName"
                          maxlength="100"
                        />
                      </app-form-field>
                      <div class="flex gap-2">
                        <button
                          appButton
                          type="button"
                          [loading]="busy()"
                          [disabled]="moneyAccountName.invalid"
                          (click)="saveMoneyAccount()"
                        >
                          Save account
                        </button>
                        <button
                          appButton
                          variant="ghost"
                          type="button"
                          (click)="cancelMoneyAccountEdit()"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                }

                <div class="mt-4 grid gap-4 lg:grid-cols-2">
                  @for (kind of moneyAccountKinds; track kind) {
                    <section class="rounded-box border border-base-300/70 p-3">
                      <div class="flex items-center justify-between gap-2">
                        <h3 class="type-heading">{{ moneyKindLabel(kind) }}</h3>
                        <span class="badge badge-ghost"
                          >{{ activeMoneyAccounts(kind).length }} active</span
                        >
                      </div>
                      <div class="mt-2 divide-y divide-base-300/60">
                        @for (account of moneyAccountsFor(kind); track account.id) {
                          <div class="flex min-h-12 items-center justify-between gap-3 py-2">
                            <div class="min-w-0">
                              <p
                                class="truncate font-medium"
                                [class.text-base-content/50]="!account.is_active"
                              >
                                {{ account.name }}
                              </p>
                              <p class="type-caption">
                                {{
                                  account.is_active
                                    ? defaultLocationLabel(account.code)
                                    : 'Archived'
                                }}
                              </p>
                            </div>
                            <div class="flex shrink-0 gap-1">
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                (click)="editMoneyAccount(account)"
                              >
                                Rename
                              </button>
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                [disabled]="busy()"
                                (click)="toggleMoneyAccount(account)"
                              >
                                {{ account.is_active ? 'Archive' : 'Restore' }}
                              </button>
                            </div>
                          </div>
                        } @empty {
                          <p class="type-caption py-3">No accounts yet.</p>
                        }
                      </div>
                    </section>
                  }
                </div>

                <div class="mt-5 border-t border-base-300/60 pt-4">
                  <h3 class="type-heading">Location defaults</h3>
                  <p class="type-caption mt-1">
                    These are preselected at checkout and used by automated M-PESA payments.
                  </p>
                  <div class="mt-3 grid gap-3">
                    @for (location of locations(); track location.id) {
                      <div
                        class="grid items-center gap-3 rounded-box bg-base-200/50 p-3 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr]"
                      >
                        <p class="font-medium">{{ location.name }}</p>
                        @for (kind of moneyAccountKinds; track kind) {
                          <app-form-field [label]="moneyKindLabel(kind)">
                            <select
                              class="select select-bordered min-h-11 w-full"
                              [ngModel]="locationDefaultCode(location.id, kind)"
                              [ngModelOptions]="{ standalone: true }"
                              [disabled]="busy() || activeMoneyAccounts(kind).length === 0"
                              (ngModelChange)="setLocationDefault(location.id, kind, $event)"
                            >
                              @for (account of activeMoneyAccounts(kind); track account.id) {
                                <option [value]="account.code">{{ account.name }}</option>
                              }
                            </select>
                          </app-form-field>
                        }
                      </div>
                    }
                  </div>
                </div>

                @if (pmMsg(); as message) {
                  <p
                    class="mt-3 text-sm"
                    [class.text-success]="message.ok"
                    [class.text-error]="!message.ok"
                  >
                    {{ message.text }}
                  </p>
                }
              </div>
            </div>

            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <h2 class="section-title">Payment methods</h2>
                  <a appButton variant="outline" routerLink="/billing">
                    Billing &amp; plan
                    <app-icon name="heroArrowRight" />
                  </a>
                </div>
                <app-mobile-list class="mt-3">
                  @for (pm of paymentMethods(); track pm.code) {
                    <div mobileListRow class="p-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="truncate font-semibold">{{ pm.name }}</p>
                          <p class="type-caption mt-1">
                            {{ pm.code }} · {{ reconciliationLabel(pm.reconciliation_type) }}
                          </p>
                        </div>
                        @if (locations().length > 1) {
                          <details class="dropdown dropdown-end shrink-0">
                            <summary class="btn btn-ghost btn-sm min-h-11">
                              {{ paymentLocationLabel(pm) }}
                            </summary>
                            <div
                              class="dropdown-content z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
                            >
                              @for (location of locations(); track location.id) {
                                <label class="label min-h-11 cursor-pointer justify-start gap-2">
                                  <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm"
                                    [checked]="paymentMethodEnabledAt(pm, location.id)"
                                    [disabled]="busy()"
                                    (change)="togglePaymentLocation(pm, location.id, $event)"
                                  />
                                  <span class="label-text">{{ location.name }}</span>
                                </label>
                              }
                            </div>
                          </details>
                        }
                      </div>
                      <div class="mt-3 grid grid-cols-3 gap-2 rounded-field bg-base-200/50 p-2">
                        <label
                          class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            [checked]="pm.enabled"
                            (change)="toggleMethod(pm, 'enabled', $event)"
                            [disabled]="busy()"
                          />
                          Enabled
                        </label>
                        <label
                          class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            [checked]="pm.requires_reconciliation"
                            (change)="toggleMethod(pm, 'requires_reconciliation', $event)"
                            [disabled]="busy()"
                          />
                          Reconcile
                        </label>
                        <label
                          class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            [checked]="pm.is_cashier_controlled"
                            (change)="toggleMethod(pm, 'is_cashier_controlled', $event)"
                            [disabled]="busy()"
                          />
                          Cashier
                        </label>
                      </div>
                    </div>
                  }
                </app-mobile-list>
                <div class="hidden lg:block">
                  <table class="table table-sm mt-2">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Enabled</th>
                        <th>Reconciliation</th>
                        <th>Cashier</th>
                        <th>Locations</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (pm of paymentMethods(); track pm.code) {
                        <tr>
                          <td>
                            <span class="text-sm font-medium">{{ pm.name }}</span>
                            <span class="ml-1 font-mono text-xs text-base-content/60">
                              {{ pm.code }}
                            </span>
                            <p class="type-caption mt-0.5">
                              {{ reconciliationLabel(pm.reconciliation_type) }}
                            </p>
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
                          <td>
                            <input
                              type="checkbox"
                              class="toggle toggle-sm"
                              [checked]="pm.is_cashier_controlled"
                              (change)="toggleMethod(pm, 'is_cashier_controlled', $event)"
                              [disabled]="busy()"
                            />
                          </td>
                          <td>
                            @if (locations().length <= 1) {
                              <span class="type-caption">Main location</span>
                            } @else {
                              <details class="dropdown dropdown-end">
                                <summary class="btn btn-ghost btn-xs min-h-9">
                                  {{ paymentLocationLabel(pm) }}
                                </summary>
                                <div
                                  class="dropdown-content z-20 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
                                >
                                  @for (location of locations(); track location.id) {
                                    <label
                                      class="label min-h-10 cursor-pointer justify-start gap-2"
                                    >
                                      <input
                                        type="checkbox"
                                        class="checkbox checkbox-sm"
                                        [checked]="paymentMethodEnabledAt(pm, location.id)"
                                        [disabled]="busy()"
                                        (change)="togglePaymentLocation(pm, location.id, $event)"
                                      />
                                      <span class="label-text">{{ location.name }}</span>
                                    </label>
                                  }
                                </div>
                              </details>
                            }
                          </td>
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
          }

          @if (
            activeTab() === 'communications' &&
            !perms.has('ManageCommunications') &&
            !perms.has('ManageTeam')
          ) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <h2 class="section-title">Notifications</h2>
                <p class="type-caption mt-1">
                  Your role does not include access to communication settings.
                </p>
              </div>
            </div>
          }

          @if (activeTab() === 'data') {
            <div class="card bg-base-100">
              <div class="card-body gap-4 p-4">
                <div>
                  <h2 class="section-title">Data import &amp; export</h2>
                  <p class="type-caption mt-1">
                    These files can contain private business and customer information. Store and
                    share them carefully.
                  </p>
                </div>

                <p class="type-caption flex items-start gap-1.5 text-info">
                  <app-icon name="heroInformationCircle" size="sm" />
                  <span>
                    Exports use this device's fresh synchronized cache. Refresh the related screen
                    first if you want to force a new snapshot before downloading.
                  </span>
                </p>

                @if (dataMessage(); as message) {
                  <div
                    role="status"
                    class="alert text-sm"
                    [class.alert-success]="message.ok"
                    [class.alert-error]="!message.ok"
                  >
                    <span>{{ message.text }}</span>
                  </div>
                }

                <div class="grid gap-3 md:grid-cols-2">
                  @if (perms.has('ManageCatalog')) {
                    <section class="rounded-box border border-base-300 p-4">
                      <div class="flex items-start gap-3">
                        <span
                          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        >
                          <app-icon name="heroArchiveBox" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <h3 class="font-semibold">Product catalog</h3>
                          <p class="type-caption mt-1">
                            {{ catalogCache.families().length }} products ·
                            {{ catalogCache.catalog().length }} variants
                            @if (!catalogCache.loaded()) {
                              · not cached yet
                            } @else if (catalogCache.catalogTruncated()) {
                              · limited cache
                            }
                          </p>
                          <p class="mt-2 text-xs text-base-content/60">
                            Export prices and stock for the current location, edit the yellow
                            columns in Excel, then preview and apply. New products use a separate
                            template.
                          </p>
                        </div>
                      </div>
                      <div class="mt-4 flex flex-wrap gap-2">
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          type="button"
                          [loading]="dataExportBusy() === 'catalog'"
                          [disabled]="dataExportBusy() !== null"
                          (click)="exportCatalog()"
                        >
                          <app-icon name="heroArrowDownTray" /> Export updates
                        </button>
                        <button
                          appButton
                          variant="secondary"
                          size="sm"
                          type="button"
                          [disabled]="dataExportBusy() !== null"
                          (click)="importOpen.set(true)"
                        >
                          <app-icon name="heroArrowUpTray" /> Import workbook
                        </button>
                      </div>
                    </section>

                    <section class="rounded-box border border-base-300 p-4">
                      <div class="flex items-start gap-3">
                        <span
                          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        >
                          <app-icon name="heroCube" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <h3 class="font-semibold">Inventory snapshot</h3>
                          <p class="type-caption mt-1">
                            {{ catalogCache.catalog().length }} variants · current location
                          </p>
                          <p class="mt-2 text-xs text-base-content/60">
                            Excel with cached quantities, values, prices, SKUs and barcodes. This
                            file is view-only; use the product update workbook or stock adjustments
                            to change quantities.
                          </p>
                        </div>
                      </div>
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        class="mt-4"
                        type="button"
                        [loading]="dataExportBusy() === 'inventory'"
                        [disabled]="dataExportBusy() !== null"
                        (click)="exportCached('inventory')"
                      >
                        <app-icon name="heroArrowDownTray" /> Export Excel
                      </button>
                    </section>
                  }

                  @if (perms.has('ManageCustomers')) {
                    <section class="rounded-box border border-base-300 p-4">
                      <h3 class="font-semibold">Customers</h3>
                      <p class="type-caption mt-1">
                        {{ partyCache.customerRows().length }} cached customers
                        @if (!partyCache.loaded()) {
                          · not cached yet
                        } @else if (!partyCache.complete()) {
                          · partial cache
                        }
                      </p>
                      <p class="mt-2 text-xs text-base-content/60">
                        Excel with contact, credit and balance fields. Export only while a validated
                        customer import workflow is not available.
                      </p>
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        class="mt-4"
                        type="button"
                        [loading]="dataExportBusy() === 'customers'"
                        [disabled]="dataExportBusy() !== null"
                        (click)="exportCached('customers')"
                      >
                        <app-icon name="heroArrowDownTray" /> Export Excel
                      </button>
                    </section>
                  }

                  @if (perms.has('ManageSupplierCreditPurchases')) {
                    <section class="rounded-box border border-base-300 p-4">
                      <h3 class="font-semibold">Suppliers</h3>
                      <p class="type-caption mt-1">
                        {{ partyCache.suppliers().length }} cached suppliers
                        @if (!partyCache.loaded()) {
                          · not cached yet
                        } @else if (!partyCache.complete()) {
                          · partial cache
                        }
                      </p>
                      <p class="mt-2 text-xs text-base-content/60">
                        Excel with contacts, payment terms and payable balances. Export only.
                      </p>
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        class="mt-4"
                        type="button"
                        [loading]="dataExportBusy() === 'suppliers'"
                        [disabled]="dataExportBusy() !== null"
                        (click)="exportCached('suppliers')"
                      >
                        <app-icon name="heroArrowDownTray" /> Export Excel
                      </button>
                    </section>
                  }

                  @if (perms.has('ViewFinancials')) {
                    <section class="rounded-box border border-base-300 p-4">
                      <h3 class="font-semibold">Recent sales</h3>
                      <p class="type-caption mt-1">
                        {{ recentSales.orders().length }} cached sales · current location
                        @if (!recentSales.loaded()) {
                          · not cached yet
                        }
                      </p>
                      <p class="mt-2 text-xs text-base-content/60">
                        Excel of the latest cached sales (up to 100). Export only; this is a
                        snapshot, not a complete accounting archive.
                      </p>
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        class="mt-4"
                        type="button"
                        [loading]="dataExportBusy() === 'recent-sales'"
                        [disabled]="dataExportBusy() !== null"
                        (click)="exportCached('recent-sales')"
                      >
                        <app-icon name="heroArrowDownTray" /> Export Excel
                      </button>
                    </section>
                  }
                </div>

                @if (!canTransferData()) {
                  <p class="type-caption">
                    Your role does not include access to any available data exports.
                  </p>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        @if (loadError()) {
          <div role="alert" class="alert alert-error">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ loadError() }}</span>
            <button appButton variant="outline" size="sm" type="button" (click)="load()">
              Retry
            </button>
          </div>
        } @else {
          <p class="text-sm text-base-content/60">Loading…</p>
        }
      }

      <app-product-import-dialog
        [(open)]="importOpen"
        (imported)="productImportCompleted($event)"
      />

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
  private readonly cashierSession = inject(CashierSessionService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly productTransfer = inject(ProductTransferService);
  private readonly cachedDataExport = inject(CachedDataExportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);
  protected readonly catalogCache = inject(CatalogCacheService);
  protected readonly partyCache = inject(PartyCacheService);
  protected readonly recentSales = inject(RecentSalesCacheService);

  protected readonly settingsTabs = computed(() =>
    SETTINGS_TABS.filter(
      tab =>
        (tab.key !== 'communications' ||
          this.perms.has('ManageCommunications') ||
          this.perms.has('ManageTeam')) &&
        (tab.key !== 'mpesa' || this.perms.has('ManageMpesaIntegration')) &&
        (tab.key !== 'data' || this.canTransferData())
    )
  );
  protected readonly activeTab = signal<SettingsTab>('business');
  protected readonly activeTabMeta = computed(
    () => SETTINGS_TABS.find(tab => tab.key === this.activeTab()) ?? SETTINGS_TABS[0]
  );
  protected readonly dataExportBusy = signal<'catalog' | CachedExportKind | null>(null);
  protected readonly dataMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly importOpen = signal(false);
  protected readonly canTransferData = computed(
    () =>
      this.perms.has('ManageCatalog') ||
      this.perms.has('ManageCustomers') ||
      this.perms.has('ManageSupplierCreditPurchases') ||
      this.perms.has('ViewFinancials')
  );

  protected readonly settings = signal<CompanySettings | null>(null);
  protected readonly primaryContactSettings = signal<PrimaryContactNotificationSettings | null>(
    null
  );
  protected readonly primaryContactLoading = signal(false);
  protected readonly primaryContactLoadError = signal<string | null>(null);
  protected readonly paymentMethods = signal<PaymentMethodRow[]>([]);
  protected readonly paymentMethodAssignments = signal<LocationPaymentMethodRow[]>([]);
  protected readonly moneyAccounts = signal<MoneyAccountRow[]>([]);
  protected readonly editingMoneyAccount = signal<MoneyAccountRow | null>(null);
  protected readonly addingMoneyKind = signal<'bank' | 'mpesa' | null>(null);
  protected readonly moneyAccountName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
  });
  protected readonly moneyAccountKinds = ['mpesa', 'bank'] as const;
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
  private requestedTab: SettingsTab | null = null;

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly slug = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(63), Validators.pattern(PUBLIC_SLUG_PATTERN)],
  });
  protected readonly whatsapp = new FormControl('', { nonNullable: true });
  protected readonly address = new FormControl('', { nonNullable: true });
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });
  protected readonly storefrontEnabled = new FormControl(false, { nonNullable: true });
  protected readonly logoBusy = signal(false);
  protected readonly logoMsg = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly enablePrinter = new FormControl(false, { nonNullable: true });
  protected readonly proformaValidityDays = new FormControl(30, { nonNullable: true });
  protected readonly cashierFlow = new FormControl(false, { nonNullable: true });
  protected readonly cashControl = new FormControl(false, { nonNullable: true });
  protected readonly requireOpening = new FormControl(false, { nonNullable: true });

  protected readonly lowStock = new FormControl(0, { nonNullable: true });
  protected readonly batchExpiry = new FormControl(false, { nonNullable: true });

  protected readonly varianceThreshold = new FormControl('', { nonNullable: true });
  protected readonly paymentRemindersEnabled = new FormControl(false, { nonNullable: true });
  protected readonly automatedCustomerNotificationsEnabled = new FormControl(true, {
    nonNullable: true,
  });
  protected readonly reminderChannel = new FormControl<'sms' | 'whatsapp'>('whatsapp', {
    nonNullable: true,
  });
  protected readonly reminderSmsFallback = new FormControl(true, { nonNullable: true });
  protected readonly primaryContactChannel = new FormControl<PrimaryContactNotificationChannel>(
    'whatsapp',
    { nonNullable: true }
  );
  protected readonly primaryTeamNotifications = new FormControl(true, { nonNullable: true });
  protected readonly primaryCashierNotifications = new FormControl(true, { nonNullable: true });
  protected readonly reminderDrafts = signal<ReminderDraft[]>([]);
  private readonly savedReminderDrafts = signal<ReminderDraft[]>([]);
  protected readonly locationName = new FormControl('', { nonNullable: true });
  protected readonly locationCode = new FormControl('', { nonNullable: true });
  protected readonly locationDefault = new FormControl(false, { nonNullable: true });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('tab') as SettingsTab | null;
      this.requestedTab = requested;
      this.normalizeActiveTab(requested);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'business' ? null : tab },
      queryParamsHandling: 'merge',
    });
  }

  protected selectTabFromValue(value: string): void {
    const tab = SETTINGS_TABS.find(item => item.key === value);
    if (tab) this.selectTab(tab.key);
  }

  protected async exportCatalog(): Promise<void> {
    this.dataExportBusy.set('catalog');
    this.dataMessage.set(null);
    try {
      await this.productTransfer.exportCatalog();
      this.dataMessage.set({ ok: true, text: 'Product update workbook downloaded.' });
    } catch (err) {
      this.dataMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Product export failed.',
      });
    } finally {
      this.dataExportBusy.set(null);
    }
  }

  protected async exportCached(kind: CachedExportKind): Promise<void> {
    this.dataExportBusy.set(kind);
    this.dataMessage.set(null);
    try {
      const result = await this.cachedDataExport.export(kind);
      this.dataMessage.set({
        ok: true,
        text: `${result.rows} row${result.rows === 1 ? '' : 's'} exported to ${result.filename}.`,
      });
    } catch (err) {
      this.dataMessage.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Export failed.',
      });
    } finally {
      this.dataExportBusy.set(null);
    }
  }

  protected async productImportCompleted(result: ProductWorkbookResult): Promise<void> {
    this.dataMessage.set({
      ok: true,
      text:
        result.kind === 'price_update'
          ? `Update complete: ${result.updated_variants} variants · ${result.retail_changes} retail · ${result.wholesale_changes} wholesale · ${result.stock_changes} stock.`
          : `Import complete: ${result.created ?? 0} products created.`,
    });
    await this.catalogCache.refresh();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.perms.ensureLoaded();
      const primarySettings = this.perms.has('ManageTeam')
        ? this.fetchPrimaryContactSettings()
        : Promise.resolve(null);
      const [
        settings,
        methods,
        locations,
        paymentAssignments,
        reminderConfiguration,
        primaryContactSettings,
        moneyAccounts,
      ] = await Promise.all([
        this.settingsService.getSettings(),
        this.settingsService.paymentMethods(),
        this.settingsService.stockLocations(),
        this.settingsService.paymentMethodLocations(),
        this.settingsService.reminderConfiguration(),
        primarySettings,
        this.settingsService.moneyAccounts(),
        this.entitlements.refresh(),
      ]);
      this.settings.set(settings);
      this.primaryContactSettings.set(primaryContactSettings);
      this.paymentMethods.set(methods);
      this.moneyAccounts.set(moneyAccounts);
      this.locations.set(locations);
      this.paymentMethodAssignments.set(paymentAssignments);
      this.name.setValue(settings.name);
      this.slug.setValue(settings.public_slug ?? '');
      this.whatsapp.setValue(settings.public_whatsapp_number ?? '');
      this.address.setValue(settings.address ?? '');
      this.email.setValue(settings.email ?? '');
      this.storefrontEnabled.setValue(settings.public_storefront_enabled);
      this.enablePrinter.setValue(settings.enable_printer);
      this.proformaValidityDays.setValue(settings.proforma_validity_days);
      this.cashierFlow.setValue(settings.cashier_flow_enabled);
      this.cashControl.setValue(settings.cash_control_enabled);
      this.requireOpening.setValue(settings.require_opening_count);
      this.lowStock.setValue(settings.low_stock_threshold);
      this.batchExpiry.setValue(settings.batch_expiry_enabled);
      this.varianceThreshold.setValue(formatKesInput(settings.variance_notification_threshold));
      this.paymentRemindersEnabled.setValue(settings.payment_reminders_enabled);
      this.automatedCustomerNotificationsEnabled.setValue(
        settings.automated_customer_notifications_override ??
          settings.automated_customer_notifications_enabled
      );
      this.reminderChannel.setValue(settings.payment_reminder_channel);
      this.reminderSmsFallback.setValue(settings.payment_reminder_sms_fallback);
      if (primaryContactSettings) {
        this.primaryContactChannel.setValue(primaryContactSettings.preferences.channel);
        this.primaryTeamNotifications.setValue(primaryContactSettings.preferences.team);
        this.primaryCashierNotifications.setValue(
          primaryContactSettings.preferences.cashierSessions
        );
      }
      const reminderDrafts = reminderConfiguration.map(rule =>
        this.reminderDraft(rule.stage_days, rule.enabled, rule.template_key)
      );
      this.reminderDrafts.set(reminderDrafts);
      this.savedReminderDrafts.set(reminderDrafts.map(draft => ({ ...draft })));
      this.markAllSectionsPristine();
      this.normalizeActiveTab(this.requestedTab);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }

  protected async reloadPrimaryContactSettings(): Promise<void> {
    const settings = await this.fetchPrimaryContactSettings();
    if (!settings) return;
    this.primaryContactSettings.set(settings);
    this.primaryContactChannel.setValue(settings.preferences.channel);
    this.primaryTeamNotifications.setValue(settings.preferences.team);
    this.primaryCashierNotifications.setValue(settings.preferences.cashierSessions);
    this.markPrimaryContactPristine();
  }

  private async fetchPrimaryContactSettings(): Promise<PrimaryContactNotificationSettings | null> {
    this.primaryContactLoading.set(true);
    this.primaryContactLoadError.set(null);
    try {
      const settings = await this.settingsService.getPrimaryContactNotificationSettings();
      this.primaryContactSettings.set(settings);
      return settings;
    } catch (err) {
      this.primaryContactSettings.set(null);
      this.primaryContactLoadError.set(
        err instanceof Error ? err.message : 'Primary contact alerts could not be loaded.'
      );
      return null;
    } finally {
      this.primaryContactLoading.set(false);
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

  protected sectionDirty(section: SectionKey): boolean {
    return this.sectionControls(section).some(control => control.dirty);
  }

  protected discardSection(section: SectionKey): void {
    const current = this.settings();
    if (!current) return;
    switch (section) {
      case 'profile':
        this.name.setValue(current.name);
        this.slug.setValue(current.public_slug ?? '');
        this.whatsapp.setValue(current.public_whatsapp_number ?? '');
        this.address.setValue(current.address ?? '');
        this.email.setValue(current.email ?? '');
        this.storefrontEnabled.setValue(current.public_storefront_enabled);
        break;
      case 'pos':
        this.enablePrinter.setValue(current.enable_printer);
        this.proformaValidityDays.setValue(current.proforma_validity_days);
        this.cashierFlow.setValue(current.cashier_flow_enabled);
        this.cashControl.setValue(current.cash_control_enabled);
        this.requireOpening.setValue(current.require_opening_count);
        break;
      case 'inventory':
        this.lowStock.setValue(current.low_stock_threshold);
        this.batchExpiry.setValue(current.batch_expiry_enabled);
        break;
      case 'cash':
        this.varianceThreshold.setValue(formatKesInput(current.variance_notification_threshold));
        break;
    }
    this.markSectionPristine(section);
    this.messages.update(messages => {
      const next = new Map(messages);
      next.delete(section);
      return next;
    });
  }

  protected logoUrl(logoPath: string): string {
    return this.settingsService.logoPublicUrl(logoPath);
  }

  /** Validate, resize (except SVG) and upload the selected logo file. */
  protected async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const s = this.settings();
    if (!file || !s) return;
    if (file.size > 2 * 1024 * 1024) {
      this.logoMsg.set({ ok: false, text: 'Logo must be 2 MB or smaller' });
      return;
    }
    this.logoBusy.set(true);
    this.logoMsg.set(null);
    try {
      const isSvg = file.type === 'image/svg+xml';
      const ext = isSvg ? 'svg' : imageExtension(file);
      const blob = isSvg ? file : await resizeImage(file, 400);
      const logoPath = await this.settingsService.uploadLogo(s.id, blob, ext);
      this.settings.set({ ...s, logo_path: logoPath });
      this.receiptData.invalidateCompanyInfo();
      this.logoMsg.set({ ok: true, text: 'Logo updated' });
    } catch (err) {
      this.logoMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      this.logoBusy.set(false);
    }
  }

  protected async removeLogo(): Promise<void> {
    const s = this.settings();
    if (!s?.logo_path) return;
    this.logoBusy.set(true);
    this.logoMsg.set(null);
    try {
      await this.settingsService.removeLogo(s.id);
      this.settings.set({ ...s, logo_path: null });
      this.receiptData.invalidateCompanyInfo();
      this.logoMsg.set({ ok: true, text: 'Logo removed' });
    } catch (err) {
      this.logoMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Remove failed' });
    } finally {
      this.logoBusy.set(false);
    }
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
        this.slug.setValue(this.slug.value.trim().toLowerCase());
        if (this.name.value.trim().length === 0) {
          this.flash('profile', false, 'Company name is required');
          return;
        }
        if (this.email.invalid) {
          this.flash('profile', false, 'Enter a valid business email');
          return;
        }
        if (this.slug.invalid) {
          this.slug.markAsTouched();
          this.flash(
            'profile',
            false,
            'Public slug may contain only lowercase letters, numbers, and single hyphens.'
          );
          return;
        }
        patch = {
          name: this.name.value.trim(),
          public_slug: this.slug.value || null,
          public_whatsapp_number: this.whatsapp.value.trim() || null,
          address: this.address.value.trim() || null,
          email: this.email.value.trim() || null,
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
        const amount = parseKes(this.varianceThreshold.value);
        if (amount === null) {
          this.flash('cash', false, 'Enter a valid threshold amount');
          return;
        }
        patch = { variance_notification_threshold: amount };
        break;
      }
    }
    this.busy.set(true);
    try {
      await this.settingsService.updateSettings(s.id, patch);
      this.settings.set({ ...s, ...patch });
      this.markSectionPristine(section);
      if (section === 'pos' || section === 'inventory') {
        await this.cashierSession.refreshConfiguration();
      }
      this.flash(section, true, 'Saved');
    } catch (err) {
      this.flash(section, false, err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleMethod(
    pm: PaymentMethodRow,
    field: 'enabled' | 'requires_reconciliation' | 'is_cashier_controlled',
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
      (event.target as HTMLInputElement).checked = !value;
      this.pmMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleCommissions(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    const current = this.settings();
    if (!current) return;
    this.busy.set(true);
    try {
      await this.settingsService.setCommissionsEnabled(enabled);
      this.settings.set({ ...current, commissions_enabled: enabled });
      await this.entitlements.refresh();
      this.flash('commissions', true, enabled ? 'Commissions enabled' : 'Commissions disabled');
    } catch (err) {
      (event.target as HTMLInputElement).checked = current.commissions_enabled;
      this.flash('commissions', false, err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveCommunicationSettings(): Promise<void> {
    const current = this.settings();
    if (!current) return;
    this.busy.set(true);
    try {
      await this.settingsService.updateCommunicationSettings({
        enabled: this.paymentRemindersEnabled.value,
        channel: this.reminderChannel.value,
        smsFallback: this.reminderSmsFallback.value,
        rules: this.reminderDrafts().map(draft => ({
          stage_days: draft.stageDays,
          enabled: draft.enabled,
          template_key: draft.key,
        })),
      });
      this.settings.set({
        ...current,
        payment_reminders_enabled: this.paymentRemindersEnabled.value,
        payment_reminder_channel: this.reminderChannel.value,
        payment_reminder_sms_fallback: this.reminderSmsFallback.value,
      });
      this.savedReminderDrafts.set(this.reminderDrafts().map(draft => ({ ...draft })));
      this.markReminderSettingsPristine();
      await this.entitlements.refresh();
      this.flash('communications', true, 'Reminder settings saved');
    } catch (err) {
      this.flash('communications', false, err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async savePrimaryContactNotifications(): Promise<void> {
    const current = this.primaryContactSettings();
    if (!current?.primary_contact_user_id) return;
    this.busy.set(true);
    try {
      const preferences = await this.settingsService.setPrimaryContactNotificationPreferences({
        channel: this.primaryContactChannel.value,
        team: this.primaryTeamNotifications.value,
        cashierSessions: this.primaryCashierNotifications.value,
      });
      this.primaryContactSettings.set({ ...current, preferences });
      this.markPrimaryContactPristine();
      this.flash('primary-contact-notifications', true, 'Admin alert preferences saved');
    } catch (err) {
      this.primaryContactChannel.setValue(current.preferences.channel, { emitEvent: false });
      this.primaryTeamNotifications.setValue(current.preferences.team, { emitEvent: false });
      this.primaryCashierNotifications.setValue(current.preferences.cashierSessions, {
        emitEvent: false,
      });
      this.markPrimaryContactPristine();
      this.flash(
        'primary-contact-notifications',
        false,
        err instanceof Error ? err.message : 'Save failed'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveAutomationPreference(): Promise<void> {
    const current = this.settings();
    if (!current || current.automated_customer_notifications_override !== null) return;
    const enabled = this.automatedCustomerNotificationsEnabled.value;
    this.busy.set(true);
    try {
      const cancelled = await this.settingsService.setAutomatedCustomerNotifications(enabled);
      this.settings.set({ ...current, automated_customer_notifications_enabled: enabled });
      this.automatedCustomerNotificationsEnabled.markAsPristine();
      this.flash(
        'automation',
        true,
        enabled
          ? 'Automated customer notifications enabled.'
          : `Automated customer notifications paused${cancelled ? `; ${cancelled} pending message(s) cancelled` : ''}.`
      );
    } catch (err) {
      this.automatedCustomerNotificationsEnabled.setValue(
        current.automated_customer_notifications_enabled,
        { emitEvent: false }
      );
      this.automatedCustomerNotificationsEnabled.markAsPristine();
      this.flash('automation', false, err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  private normalizeActiveTab(requested: SettingsTab | null): void {
    const available = this.settingsTabs();
    const next = requested && available.some(tab => tab.key === requested) ? requested : 'business';
    this.activeTab.set(next);
  }

  protected primaryContactDirty(): boolean {
    return [
      this.primaryContactChannel,
      this.primaryTeamNotifications,
      this.primaryCashierNotifications,
    ].some(control => control.dirty);
  }

  protected discardPrimaryContactNotifications(): void {
    const current = this.primaryContactSettings();
    if (!current) return;
    this.primaryContactChannel.setValue(current.preferences.channel);
    this.primaryTeamNotifications.setValue(current.preferences.team);
    this.primaryCashierNotifications.setValue(current.preferences.cashierSessions);
    this.markPrimaryContactPristine();
    this.clearMessage('primary-contact-notifications');
  }

  protected reminderSettingsDirty(): boolean {
    const controlsDirty = [
      this.paymentRemindersEnabled,
      this.reminderChannel,
      this.reminderSmsFallback,
    ].some(control => control.dirty);
    if (controlsDirty) return true;
    return !this.sameReminderDrafts(this.reminderDrafts(), this.savedReminderDrafts());
  }

  protected discardCommunicationSettings(): void {
    const current = this.settings();
    if (!current) return;
    this.paymentRemindersEnabled.setValue(current.payment_reminders_enabled);
    this.reminderChannel.setValue(current.payment_reminder_channel);
    this.reminderSmsFallback.setValue(current.payment_reminder_sms_fallback);
    this.reminderDrafts.set(this.savedReminderDrafts().map(draft => ({ ...draft })));
    this.markReminderSettingsPristine();
    this.clearMessage('communications');
  }

  private sectionControls(section: SectionKey): AbstractControl[] {
    switch (section) {
      case 'profile':
        return [
          this.name,
          this.slug,
          this.whatsapp,
          this.address,
          this.email,
          this.storefrontEnabled,
        ];
      case 'pos':
        return [
          this.enablePrinter,
          this.proformaValidityDays,
          this.cashierFlow,
          this.cashControl,
          this.requireOpening,
        ];
      case 'inventory':
        return [this.lowStock, this.batchExpiry];
      case 'cash':
        return [this.varianceThreshold];
    }
  }

  private markSectionPristine(section: SectionKey): void {
    for (const control of this.sectionControls(section)) control.markAsPristine();
  }

  private markAllSectionsPristine(): void {
    for (const section of ['profile', 'pos', 'inventory', 'cash'] as const) {
      this.markSectionPristine(section);
    }
    this.markPrimaryContactPristine();
    this.markReminderSettingsPristine();
    this.automatedCustomerNotificationsEnabled.markAsPristine();
  }

  private markPrimaryContactPristine(): void {
    for (const control of [
      this.primaryContactChannel,
      this.primaryTeamNotifications,
      this.primaryCashierNotifications,
    ]) {
      control.markAsPristine();
    }
  }

  private markReminderSettingsPristine(): void {
    for (const control of [
      this.paymentRemindersEnabled,
      this.reminderChannel,
      this.reminderSmsFallback,
    ]) {
      control.markAsPristine();
    }
  }

  private clearMessage(key: string): void {
    this.messages.update(messages => {
      const next = new Map(messages);
      next.delete(key);
      return next;
    });
  }

  private sameReminderDrafts(left: ReminderDraft[], right: ReminderDraft[]): boolean {
    return (
      left.length === right.length &&
      left.every(
        (draft, index) =>
          draft.key === right[index]?.key &&
          draft.stageDays === right[index]?.stageDays &&
          draft.enabled === right[index]?.enabled
      )
    );
  }

  private reminderDraft(stageDays: number, enabled: boolean, key: string): ReminderDraft {
    return {
      stageDays,
      enabled,
      key,
    };
  }

  protected reminderStageLabel(days: number): string {
    return days === 0 ? 'Due today' : `${days} days overdue`;
  }

  protected setReminderStageEnabled(key: string, event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.reminderDrafts.update(rows =>
      rows.map(row => (row.key === key ? { ...row, enabled } : row))
    );
  }

  protected paymentMethodEnabledAt(method: PaymentMethodRow, locationId: string): boolean {
    return this.paymentMethodAssignments().some(
      assignment =>
        assignment.payment_method_id === method.id &&
        assignment.location_id === locationId &&
        assignment.enabled
    );
  }

  protected moneyKindLabel(kind: 'bank' | 'mpesa'): string {
    return kind === 'mpesa' ? 'M-PESA' : 'Bank';
  }

  protected moneyAccountsFor(kind: 'bank' | 'mpesa'): MoneyAccountRow[] {
    return this.moneyAccounts()
      .filter(account => account.money_account_kind === kind)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
  }

  protected activeMoneyAccounts(kind: 'bank' | 'mpesa'): MoneyAccountRow[] {
    return this.moneyAccountsFor(kind).filter(account => account.is_active);
  }

  protected locationDefaultCode(locationId: string, kind: 'bank' | 'mpesa'): string {
    const method = this.paymentMethods().find(item => item.code === kind);
    if (!method) return '';
    return (
      this.paymentMethodAssignments().find(
        assignment =>
          assignment.location_id === locationId && assignment.payment_method_id === method.id
      )?.ledger_account_code ?? method.ledger_account_code
    );
  }

  protected defaultLocationLabel(accountCode: string): string {
    const defaults = this.locations().filter(location =>
      this.moneyAccountKinds.some(
        kind => this.locationDefaultCode(location.id, kind) === accountCode
      )
    );
    if (defaults.length === 0) return 'Available at checkout';
    if (defaults.length === this.locations().length) return 'Default at all locations';
    return `Default at ${defaults.length} location${defaults.length === 1 ? '' : 's'}`;
  }

  protected startMoneyAccount(kind: 'bank' | 'mpesa'): void {
    this.editingMoneyAccount.set(null);
    this.addingMoneyKind.set(kind);
    this.moneyAccountName.setValue('');
  }

  protected editMoneyAccount(account: MoneyAccountRow): void {
    this.addingMoneyKind.set(null);
    this.editingMoneyAccount.set(account);
    this.moneyAccountName.setValue(account.name);
  }

  protected cancelMoneyAccountEdit(): void {
    this.addingMoneyKind.set(null);
    this.editingMoneyAccount.set(null);
    this.moneyAccountName.setValue('');
  }

  protected async saveMoneyAccount(): Promise<void> {
    if (this.moneyAccountName.invalid) return;
    const name = this.moneyAccountName.value.trim();
    const editing = this.editingMoneyAccount();
    const kind = this.addingMoneyKind();
    if (!editing && !kind) return;
    this.busy.set(true);
    this.pmMsg.set(null);
    try {
      if (editing) {
        await this.settingsService.updateMoneyAccount(editing.id, { name });
      } else {
        await this.settingsService.createMoneyAccount(kind!, name);
      }
      this.moneyAccounts.set(await this.settingsService.moneyAccounts());
      this.cancelMoneyAccountEdit();
      this.pmMsg.set({ ok: true, text: editing ? 'Account renamed' : 'Account created' });
    } catch (err) {
      this.pmMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleMoneyAccount(account: MoneyAccountRow): Promise<void> {
    this.busy.set(true);
    this.pmMsg.set(null);
    try {
      await this.settingsService.updateMoneyAccount(account.id, { isActive: !account.is_active });
      this.moneyAccounts.set(await this.settingsService.moneyAccounts());
      this.pmMsg.set({
        ok: true,
        text: account.is_active ? 'Account archived' : 'Account restored',
      });
    } catch (err) {
      this.pmMsg.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Account update failed',
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected async setLocationDefault(
    locationId: string,
    kind: 'bank' | 'mpesa',
    accountCode: string
  ): Promise<void> {
    if (!accountCode || accountCode === this.locationDefaultCode(locationId, kind)) return;
    this.busy.set(true);
    this.pmMsg.set(null);
    try {
      await this.settingsService.setLocationPaymentAccount(locationId, kind, accountCode);
      this.paymentMethodAssignments.set(await this.settingsService.paymentMethodLocations());
      this.pmMsg.set({ ok: true, text: `${this.moneyKindLabel(kind)} default updated` });
    } catch (err) {
      this.pmMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Human label for a payment method's reconciliation type (settings list). */
  protected readonly reconciliationLabel = reconciliationLabel;

  protected paymentLocationLabel(method: PaymentMethodRow): string {
    const count = this.locations().filter(location =>
      this.paymentMethodEnabledAt(method, location.id)
    ).length;
    if (count === this.locations().length) return 'All locations';
    return `${count} of ${this.locations().length}`;
  }

  protected async togglePaymentLocation(
    method: PaymentMethodRow,
    locationId: string,
    event: Event
  ): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    const selected = new Set(
      this.locations()
        .filter(location => this.paymentMethodEnabledAt(method, location.id))
        .map(location => location.id)
    );
    if (checked) selected.add(locationId);
    else selected.delete(locationId);
    const ids = [...selected];
    const all = ids.length === this.locations().length;
    this.busy.set(true);
    try {
      await this.settingsService.setPaymentMethodLocations(method.code, ids, all);
      this.paymentMethodAssignments.set(await this.settingsService.paymentMethodLocations());
      this.paymentMethods.update(items =>
        items.map(item =>
          item.id === method.id
            ? { ...item, availability_scope: all ? 'all_locations' : 'selected_locations' }
            : item
        )
      );
      this.pmMsg.set({ ok: true, text: `${method.name} locations updated` });
    } catch (err) {
      (event.target as HTMLInputElement).checked = !checked;
      this.pmMsg.set({ ok: false, text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      this.busy.set(false);
    }
  }
}
