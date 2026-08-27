import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { FulfillmentSettingsComponent } from './fulfillment-settings.component';
import { SettingsDataTransferComponent } from './settings-data-transfer.component';
import { BusinessSettingsComponent } from './business-settings.component';
import { PosCashSettingsComponent } from './pos-cash-settings.component';
import { InventorySettingsComponent } from './inventory-settings.component';
import { StockLocationsSettingsComponent } from './stock-locations-settings.component';
import { MoneySettingsComponent } from './money-settings.component';
import { CommunicationsSettingsComponent } from './communications-settings.component';
import { CompanySettingsStore } from './company-settings.store';
import { BillingComponent } from '../billing/billing.component';

type SettingsTab =
  'business' | 'operations' | 'fulfillment' | 'money' | 'communications' | 'billing' | 'data';
type LegacySettingsTab = SettingsTab | 'mpesa';

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
    key: 'communications',
    label: 'Notifications',
    description: 'Choose which operational and customer alerts are sent.',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Plan, renewal status and subscription payments.',
  },
  {
    key: 'data',
    label: 'Data',
    description: 'Move business data in and out of Dukarun safely.',
  },
];

/**
 * Settings is intentionally a thin composition root.
 *
 * Keep tab availability, URL normalization, and the shared "settings loaded" gate here. Line of
 * business state belongs in the child components mounted by each tab. If a new setting needs form
 * controls, service calls, dirty state, or save/retry behavior, put it in the owning tab component
 * or a deeper child instead of threading it through this shell.
 */
@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    PageLayoutComponent,
    ButtonComponent,
    IconComponent,
    FulfillmentSettingsComponent,
    SettingsDataTransferComponent,
    BusinessSettingsComponent,
    PosCashSettingsComponent,
    InventorySettingsComponent,
    StockLocationsSettingsComponent,
    MoneySettingsComponent,
    CommunicationsSettingsComponent,
    BillingComponent,
  ],
  template: `
    <app-page title="Settings" subtitle="Manage how Dukarun works for this business." [wide]="true">
      @if (loadError()) {
        <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
      }

      @if (settings()) {
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
            <app-business-settings />
          }

          @if (activeTab() === 'operations') {
            <div class="grid gap-4 xl:grid-cols-3 xl:items-stretch">
              <app-pos-cash-settings class="block min-w-0 xl:col-span-2" />
              <app-inventory-settings class="block min-w-0" />
            </div>

            <app-stock-locations-settings />
          }

          @if (activeTab() === 'fulfillment') {
            <app-fulfillment-settings />
          }

          @if (activeTab() === 'money') {
            <app-money-settings />
          }

          @if (activeTab() === 'communications') {
            <app-communications-settings />
          }

          @if (activeTab() === 'billing') {
            @defer {
              <app-billing [embedded]="true" />
            } @placeholder {
              <p class="text-sm text-base-content/60">Loading billing…</p>
            }
          }

          @if (activeTab() === 'data') {
            <app-settings-data-transfer />
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
    </app-page>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);

  protected readonly settingsTabs = computed(() =>
    SETTINGS_TABS.filter(
      tab =>
        (tab.key !== 'communications' ||
          this.perms.has('ManageCommunications') ||
          this.perms.has('ManageTeam')) &&
        (tab.key !== 'data' || this.canTransferData())
    )
  );
  private readonly activeTabState = signal<SettingsTab>('business');
  protected readonly activeTab = this.activeTabState.asReadonly();
  protected readonly activeTabMeta = computed(
    () => SETTINGS_TABS.find(tab => tab.key === this.activeTab()) ?? SETTINGS_TABS[0]
  );
  protected readonly canTransferData = computed(
    () =>
      this.perms.has('ManageCatalog') ||
      this.perms.has('ManageCustomers') ||
      this.perms.has('ManageSupplierCreditPurchases') ||
      this.perms.has('ViewFinancials')
  );

  protected readonly settings = this.companySettings.settings;
  private readonly loadErrorState = signal<string | null>(null);
  protected readonly loadError = this.loadErrorState.asReadonly();
  private requestedTab: LegacySettingsTab | null = null;
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('tab') as LegacySettingsTab | null;
      this.requestedTab = requested;
      this.normalizeActiveTab(requested);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected selectTab(tab: SettingsTab): void {
    this.activeTabState.set(tab);
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

  protected async load(): Promise<void> {
    this.loadErrorState.set(null);
    try {
      await Promise.all([
        this.perms.ensureLoaded(),
        this.companySettings.load(),
        this.entitlements.refresh(),
      ]);
      this.normalizeActiveTab(this.requestedTab);
    } catch (err) {
      this.loadErrorState.set(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }

  private normalizeActiveTab(requested: LegacySettingsTab | null): void {
    if (requested === 'mpesa') {
      this.activeTabState.set('money');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: 'money' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      return;
    }
    const available = this.settingsTabs();
    const next = requested && available.some(tab => tab.key === requested) ? requested : 'business';
    this.activeTabState.set(next);
  }
}
