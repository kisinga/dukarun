import { Component, OnInit, inject, signal } from '@angular/core';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { CashVarianceSettingsComponent } from './cash-variance-settings.component';
import { CompanySettingsStore } from './company-settings.store';
import { MoneyCommissionsSettingsComponent } from './money-commissions-settings.component';
import { MoneySettingsStore } from './money-settings.store';
import { PaymentAccountsSettingsComponent } from './payment-accounts-settings.component';
import { PaymentMethodsSettingsComponent } from './payment-methods-settings.component';
import { StockLocationsStore } from './stock-locations.store';
import { TaxSettingsComponent } from './tax-settings.component';

/**
 * Money settings composition root.
 *
 * This shell keeps the accounting-oriented settings together, but each panel owns the behavior
 * that belongs to its line of business. Payment account/method state is shared through a
 * component-scoped MoneySettingsStore so child panels compose around one coherent reconciliation
 * model instead of pushing a large input/output surface through this parent.
 */
@Component({
  selector: 'app-money-settings',
  imports: [
    ButtonComponent,
    IconComponent,
    TaxSettingsComponent,
    CashVarianceSettingsComponent,
    MoneyCommissionsSettingsComponent,
    PaymentAccountsSettingsComponent,
    PaymentMethodsSettingsComponent,
  ],
  providers: [MoneySettingsStore],
  template: `
    @if (loadError()) {
      <div role="alert" class="alert alert-error">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ loadError() }}</span>
        <button appButton variant="outline" size="sm" type="button" (click)="load()">Retry</button>
      </div>
    } @else if (settings()) {
      <app-tax-settings />

      <app-cash-variance-settings />

      @if (entitlements.enabled('commissions') && perms.has('ManageCommissions')) {
        <app-money-commissions-settings />
      }

      @if (perms.has('ManageReconciliation')) {
        <app-payment-accounts-settings />
        <app-payment-methods-settings />
      }
    } @else {
      <p class="text-sm text-base-content/60">Loading money settings...</p>
    }
  `,
})
export class MoneySettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly stockLocations = inject(StockLocationsStore);
  private readonly paymentSettings = inject(MoneySettingsStore);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);

  protected readonly settings = this.companySettings.settings;
  protected readonly loadError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.perms.ensureLoaded();
      await Promise.all([
        this.companySettings.load(),
        this.entitlements.refresh(),
        this.stockLocations.load(),
      ]);
      await this.paymentSettings.load();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Failed to load money settings');
    }
  }
}
