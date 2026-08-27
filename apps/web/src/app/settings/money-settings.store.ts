import { Injectable, computed, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { PermissionsService } from '../core/permissions.service';
import {
  type LocationPaymentMethodRow,
  type MoneyAccountRow,
  type MoneyPaymentAccountOverview,
  type PaymentMethodRow,
  SettingsService,
} from './settings.service';
import { StockLocationsStore } from './stock-locations.store';

export type MoneyKind = 'bank' | 'mpesa';
export type PaymentMethodToggleField =
  'enabled' | 'requires_reconciliation' | 'is_cashier_controlled';
export type MoneySettingsMessage = { ok: boolean; text: string };
export type MoneySettingsBadgeType = 'success' | 'warning' | 'error' | 'neutral' | 'info';

/**
 * Feature-local state for the Money tab's payment setup surfaces.
 *
 * Keep payment methods, money accounts, location defaults and M-PESA setup selection together:
 * each of those views reads or mutates the same reconciliation configuration. Company settings
 * fields such as tax, commissions and variance remain in their own panels because they have
 * separate save lifecycles.
 */
@Injectable()
export class MoneySettingsStore {
  private readonly settingsService = inject(SettingsService);
  private readonly stockLocations = inject(StockLocationsStore);
  private readonly perms = inject(PermissionsService);

  readonly locations = this.stockLocations.locations;
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly loadedState = signal(false);
  readonly loaded = this.loadedState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly messageState = signal<MoneySettingsMessage | null>(null);
  readonly message = this.messageState.asReadonly();

  private readonly paymentMethodsState = signal<PaymentMethodRow[]>([]);
  readonly paymentMethods = this.paymentMethodsState.asReadonly();
  private readonly paymentMethodAssignmentsState = signal<LocationPaymentMethodRow[]>([]);
  readonly paymentMethodAssignments = this.paymentMethodAssignmentsState.asReadonly();
  private readonly moneyAccountsState = signal<MoneyAccountRow[]>([]);
  readonly moneyAccounts = this.moneyAccountsState.asReadonly();
  private readonly moneyAccountOverviewState = signal<MoneyPaymentAccountOverview[]>([]);
  readonly moneyAccountOverview = this.moneyAccountOverviewState.asReadonly();
  private readonly mpesaSetupAccountCodeState = signal<string | null>(null);
  readonly mpesaSetupAccountCode = this.mpesaSetupAccountCodeState.asReadonly();
  private readonly editingMoneyAccountState = signal<MoneyAccountRow | null>(null);
  readonly editingMoneyAccount = this.editingMoneyAccountState.asReadonly();
  private readonly addingMoneyKindState = signal<MoneyKind | null>(null);
  readonly addingMoneyKind = this.addingMoneyKindState.asReadonly();
  readonly moneyAccountName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
  });
  readonly moneyAccountKinds = ['mpesa', 'bank'] as const;
  private loadRequest = 0;

  readonly moneyAccountsList = computed(() => {
    const rank: Record<MoneyKind, number> = { mpesa: 0, bank: 1 };
    return this.moneyAccounts()
      .filter(
        account => account.money_account_kind === 'bank' || account.money_account_kind === 'mpesa'
      )
      .sort(
        (a, b) =>
          Number(b.is_active) - Number(a.is_active) ||
          rank[a.money_account_kind as MoneyKind] - rank[b.money_account_kind as MoneyKind] ||
          a.name.localeCompare(b.name)
      );
  });
  readonly selectedMpesaSetupAccount = computed<MoneyAccountRow | null>(() => {
    const code = this.mpesaSetupAccountCode();
    return (
      this.moneyAccounts().find(
        account => account.money_account_kind === 'mpesa' && account.code === code
      ) ?? null
    );
  });
  readonly mpesaSetupOpen = computed(() => this.selectedMpesaSetupAccount() !== null);

  async load(force = false): Promise<void> {
    await this.perms.ensureLoaded();
    if (!this.perms.has('ManageReconciliation')) return;
    if (this.loaded() && !force) return;
    const request = ++this.loadRequest;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const accountOverview =
        this.perms.has('ManageReconciliation') ||
        this.perms.has('ManageMpesaIntegration') ||
        this.perms.has('ViewFinancials')
          ? this.settingsService.moneyPaymentAccountsOverview()
          : Promise.resolve([]);
      const [methods, paymentAssignments, moneyAccounts, moneyAccountOverview] = await Promise.all([
        this.settingsService.paymentMethods(),
        this.settingsService.paymentMethodLocations(),
        this.settingsService.moneyAccounts(),
        accountOverview,
      ]);
      if (request !== this.loadRequest) return;
      this.paymentMethodsState.set(methods);
      this.paymentMethodAssignmentsState.set(paymentAssignments);
      this.moneyAccountsState.set(moneyAccounts);
      this.moneyAccountOverviewState.set(moneyAccountOverview);
      this.loadedState.set(true);
    } catch (error) {
      if (request !== this.loadRequest) return;
      this.errorState.set(
        error instanceof Error ? error.message : 'Payment settings could not be loaded.'
      );
    } finally {
      if (request === this.loadRequest) this.loadingState.set(false);
    }
  }

  async refreshMoneyAccounts(): Promise<void> {
    const [moneyAccounts, overview] = await Promise.all([
      this.settingsService.moneyAccounts(),
      this.settingsService.moneyPaymentAccountsOverview(),
    ]);
    this.moneyAccountsState.set(moneyAccounts);
    this.moneyAccountOverviewState.set(overview);
  }

  paymentMethodEnabledAt(method: PaymentMethodRow, locationId: string): boolean {
    return this.paymentMethodAssignments().some(
      assignment =>
        assignment.payment_method_id === method.id &&
        assignment.location_id === locationId &&
        assignment.enabled
    );
  }

  moneyKindLabel(kind: MoneyKind): string {
    return kind === 'mpesa' ? 'M-PESA' : 'Bank';
  }

  moneyAccountTypeLabel(account: MoneyAccountRow): string {
    return account.money_account_kind === 'mpesa' ? 'M-PESA' : 'Bank';
  }

  moneyAccountsFor(kind: MoneyKind): MoneyAccountRow[] {
    return this.moneyAccounts()
      .filter(account => account.money_account_kind === kind)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
  }

  activeMoneyAccounts(kind: MoneyKind): MoneyAccountRow[] {
    return this.moneyAccountsFor(kind).filter(account => account.is_active);
  }

  mpesaSetupState(account: MoneyAccountRow): { status: string; label: string } {
    const overview = this.moneyAccountOverview().find(item => item.account_code === account.code);
    const status = overview?.mpesa_connection?.status ?? overview?.mpesa_request?.status ?? null;
    if (!status) return { status: 'not_connected', label: 'Not connected' };
    return { status, label: this.statusLabel(status) };
  }

  mpesaSetupStatusType(status: string): MoneySettingsBadgeType {
    if (status === 'active' || status === 'live') return 'success';
    if (status === 'testing' || status === 'merchant_verification' || status === 'daraja_setup')
      return 'warning';
    if (status === 'error' || status === 'rejected') return 'error';
    if (status === 'not_connected') return 'neutral';
    return 'info';
  }

  mpesaSetupButtonLabel(account: MoneyAccountRow): string {
    const status = this.mpesaSetupState(account).status;
    if (status === 'not_connected') return 'Connect';
    if (status === 'active' || status === 'live') return 'View setup';
    return 'Continue setup';
  }

  mpesaSetupLocationNames(accountCode: string): string[] {
    return (
      this.moneyAccountOverview().find(item => item.account_code === accountCode)
        ?.default_location_names ?? []
    );
  }

  openMpesaSetup(accountCode: string): void {
    this.mpesaSetupAccountCodeState.set(accountCode);
  }

  closeMpesaSetup(): void {
    this.mpesaSetupAccountCodeState.set(null);
  }

  locationDefaultCode(locationId: string, kind: MoneyKind): string {
    const method = this.paymentMethods().find(item => item.code === kind);
    if (!method) return '';
    return (
      this.paymentMethodAssignments().find(
        assignment =>
          assignment.location_id === locationId && assignment.payment_method_id === method.id
      )?.ledger_account_code ?? method.ledger_account_code
    );
  }

  defaultLocationLabel(accountCode: string): string {
    const defaults = this.locations().filter(location =>
      this.moneyAccountKinds.some(
        kind => this.locationDefaultCode(location.id, kind) === accountCode
      )
    );
    if (defaults.length === 0) return 'Available at checkout';
    if (defaults.length === this.locations().length) return 'Default at all locations';
    return `Default at ${defaults.length} location${defaults.length === 1 ? '' : 's'}`;
  }

  startMoneyAccount(kind: MoneyKind): void {
    this.editingMoneyAccountState.set(null);
    this.addingMoneyKindState.set(kind);
    this.resetMoneyAccountName('');
  }

  editMoneyAccount(account: MoneyAccountRow): void {
    this.addingMoneyKindState.set(null);
    this.editingMoneyAccountState.set(account);
    this.resetMoneyAccountName(account.name);
  }

  cancelMoneyAccountEdit(): void {
    this.addingMoneyKindState.set(null);
    this.editingMoneyAccountState.set(null);
    this.resetMoneyAccountName('');
  }

  async saveMoneyAccount(): Promise<void> {
    if (this.moneyAccountName.invalid) {
      this.moneyAccountName.markAsTouched();
      return;
    }
    const name = this.moneyAccountName.value.trim();
    const editing = this.editingMoneyAccount();
    const kind = this.addingMoneyKind();
    if (!editing && !kind) return;
    this.busyState.set(true);
    this.messageState.set(null);
    try {
      if (editing) {
        await this.settingsService.updateMoneyAccount(editing.id, { name });
      } else {
        await this.settingsService.createMoneyAccount(kind!, name);
      }
      await this.refreshMoneyAccounts();
      if (!editing && kind === 'mpesa') {
        const created = this.moneyAccounts().find(
          account => account.money_account_kind === 'mpesa' && account.name === name
        );
        this.mpesaSetupAccountCodeState.set(created?.code ?? null);
      }
      this.cancelMoneyAccountEdit();
      this.messageState.set({ ok: true, text: editing ? 'Account renamed' : 'Account created' });
    } catch (error) {
      this.messageState.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Save failed',
      });
    } finally {
      this.busyState.set(false);
    }
  }

  async toggleMoneyAccount(account: MoneyAccountRow): Promise<void> {
    this.busyState.set(true);
    this.messageState.set(null);
    try {
      await this.settingsService.updateMoneyAccount(account.id, { isActive: !account.is_active });
      await this.refreshMoneyAccounts();
      this.messageState.set({
        ok: true,
        text: account.is_active ? 'Account archived' : 'Account restored',
      });
    } catch (error) {
      this.messageState.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Account update failed',
      });
    } finally {
      this.busyState.set(false);
    }
  }

  async setLocationDefault(
    locationId: string,
    kind: MoneyKind,
    accountCode: string
  ): Promise<void> {
    if (!accountCode || accountCode === this.locationDefaultCode(locationId, kind)) return;
    this.busyState.set(true);
    this.messageState.set(null);
    try {
      await this.settingsService.setLocationPaymentAccount(locationId, kind, accountCode);
      this.paymentMethodAssignmentsState.set(await this.settingsService.paymentMethodLocations());
      this.moneyAccountOverviewState.set(await this.settingsService.moneyPaymentAccountsOverview());
      this.messageState.set({ ok: true, text: `${this.moneyKindLabel(kind)} default updated` });
    } catch (error) {
      this.messageState.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Update failed',
      });
    } finally {
      this.busyState.set(false);
    }
  }

  async toggleMethod(
    method: PaymentMethodRow,
    field: PaymentMethodToggleField,
    value: boolean
  ): Promise<boolean> {
    this.busyState.set(true);
    this.messageState.set(null);
    try {
      await this.settingsService.updatePaymentMethod(method.code, { [field]: value });
      this.paymentMethodsState.update(list =>
        list.map(item => (item.code === method.code ? { ...item, [field]: value } : item))
      );
      this.messageState.set({ ok: true, text: `${method.name} updated` });
      return true;
    } catch (error) {
      this.messageState.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Update failed',
      });
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  paymentLocationLabel(method: PaymentMethodRow): string {
    const count = this.locations().filter(location =>
      this.paymentMethodEnabledAt(method, location.id)
    ).length;
    if (count === this.locations().length) return 'All locations';
    return `${count} of ${this.locations().length}`;
  }

  async togglePaymentLocation(
    method: PaymentMethodRow,
    locationId: string,
    checked: boolean
  ): Promise<boolean> {
    const selected = new Set(
      this.locations()
        .filter(location => this.paymentMethodEnabledAt(method, location.id))
        .map(location => location.id)
    );
    if (checked) selected.add(locationId);
    else selected.delete(locationId);
    const ids = [...selected];
    const all = ids.length === this.locations().length;
    this.busyState.set(true);
    this.messageState.set(null);
    try {
      await this.settingsService.setPaymentMethodLocations(method.code, ids, all);
      this.paymentMethodAssignmentsState.set(await this.settingsService.paymentMethodLocations());
      this.paymentMethodsState.update(items =>
        items.map(item =>
          item.id === method.id
            ? { ...item, availability_scope: all ? 'all_locations' : 'selected_locations' }
            : item
        )
      );
      this.messageState.set({ ok: true, text: `${method.name} locations updated` });
      return true;
    } catch (error) {
      this.messageState.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Update failed',
      });
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  private resetMoneyAccountName(value: string): void {
    this.moneyAccountName.setValue(value, { emitEvent: false });
    this.moneyAccountName.markAsPristine();
    this.moneyAccountName.markAsUntouched();
  }

  private statusLabel(value: string): string {
    return value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  }
}
