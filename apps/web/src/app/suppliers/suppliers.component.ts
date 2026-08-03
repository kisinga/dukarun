import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes, parseKesToCents } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import { AgingInfo, LedgerAccount, MoneyCustomer, MoneyService } from '../money/money.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../shared/ui/session-required-notice.component';

type SupplierWithAp = MoneyCustomer & { ap_balance: number } & AgingInfo;
type PurchaseRow = {
  id: string;
  supplier_id: string;
  total_cost: number;
  is_credit: boolean;
  reference: string | null;
  created_at: string;
  paid: number;
};

interface PurchaseLineForm {
  variantId: string;
  quantity: number;
  unitCost: string; // KES text
  expiryDate: string; // yyyy-mm-dd or ''
}

@Component({
  selector: 'app-suppliers',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    IconComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    StatCardComponent,
    PageLayoutComponent,
    SessionRequiredNoticeComponent,
  ],
  template: `
    <app-page title="Suppliers" subtitle="Record incoming stock and keep supplier credit clear.">
      <button actions appButton variant="ghost" (click)="createOpen.set(!createOpen())">
        <app-icon [name]="createOpen() ? 'heroXMark' : 'heroPlus'" />
        {{ createOpen() ? 'Cancel' : 'New supplier' }}
      </button>
      <button actions appButton variant="ghost" [loading]="loading()" (click)="load()">
        <app-icon name="heroArrowPath" />
        Refresh
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <div class="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <app-stat-card
          label="Suppliers"
          [value]="String(suppliers().length)"
          sub="Active records"
        />
        <app-stat-card
          label="Amount owed"
          [value]="perms.has('ViewFinancials') ? fmt(totalOutstanding()) : 'Hidden'"
          [sub]="String(suppliersOwed().length) + ' supplier(s)'"
          [tone]="totalOutstanding() > 0 ? 'warning' : 'neutral'"
        />
        <app-stat-card
          label="Credit purchases due"
          [value]="String(openCreditPurchases())"
          sub="Unpaid or part-paid"
          [tone]="openCreditPurchases() > 0 ? 'warning' : 'neutral'"
        />
      </div>

      @if (createOpen()) {
        <div class="card mb-4 bg-base-100">
          <form
            (submit)="$event.preventDefault(); createSupplier()"
            class="card-body grid gap-3 p-4 sm:grid-cols-3"
          >
            <app-form-field label="Supplier name" [required]="true">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                autocomplete="organization"
                [formControl]="newName"
              />
            </app-form-field>
            <app-form-field label="Phone">
              <input
                type="tel"
                class="input input-bordered input-sm w-full"
                autocomplete="tel"
                [formControl]="newPhone"
              />
            </app-form-field>
            <div class="flex items-end">
              <button
                appButton
                type="submit"
                [loading]="busy()"
                [disabled]="newName.value.trim().length === 0"
              >
                Create supplier
              </button>
            </div>
          </form>
        </div>
      }

      <div class="grid gap-4 xl:grid-cols-3">
        <section class="card bg-base-100 xl:col-span-2">
          <div class="card-body p-4">
            <div>
              <h2 class="section-title">Record a purchase</h2>
              <p class="type-caption mt-1">Stock is added as soon as this purchase is saved.</p>
            </div>

            <form
              (submit)="$event.preventDefault(); recordPurchase()"
              class="mt-2 flex flex-col gap-4"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <app-form-field label="Supplier" [required]="true">
                  <select
                    class="select select-bordered select-sm w-full"
                    [formControl]="purchaseSupplier"
                  >
                    @for (s of suppliers(); track s.id) {
                      <option [value]="s.id">{{ name(s) }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="Supplier invoice / reference">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Optional"
                    [formControl]="purchaseReference"
                  />
                </app-form-field>
              </div>

              <fieldset>
                <legend class="form-field-label mb-2">How are you paying?</legend>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    class="min-h-20 rounded-box border p-3 text-left transition-colors"
                    [class.border-primary]="!purchaseOnCredit.value"
                    [class.bg-base-200]="!purchaseOnCredit.value"
                    [class.border-base-300]="purchaseOnCredit.value"
                    (click)="setPurchaseCredit(false)"
                  >
                    <span class="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="radio"
                        class="radio radio-primary radio-sm"
                        tabindex="-1"
                        [checked]="!purchaseOnCredit.value"
                      />
                      Paid now
                    </span>
                    <span class="type-caption mt-1 block pl-6">
                      Money leaves an account now. Supplier balance stays unchanged.
                    </span>
                  </button>
                  @if (perms.has('ManageSupplierCreditPurchases')) {
                    <button
                      type="button"
                      class="min-h-20 rounded-box border p-3 text-left transition-colors"
                      [class.border-warning]="purchaseOnCredit.value"
                      [class.bg-base-200]="purchaseOnCredit.value"
                      [class.border-base-300]="!purchaseOnCredit.value"
                      (click)="setPurchaseCredit(true)"
                    >
                      <span class="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          class="radio radio-warning radio-sm"
                          tabindex="-1"
                          [checked]="purchaseOnCredit.value"
                        />
                        Pay later
                      </span>
                      <span class="type-caption mt-1 block pl-6">
                        Adds the purchase total to this supplier's amount owed.
                      </span>
                    </button>
                  }
                </div>
              </fieldset>

              @if (!purchaseOnCredit.value) {
                @if (!cashierSession.isOpen()) {
                  <app-session-required-notice action="recording a paid purchase" />
                }
                <app-form-field label="Paid from" class="sm:max-w-sm">
                  <select
                    class="select select-bordered select-sm w-full"
                    [formControl]="purchaseAccount"
                  >
                    @for (a of accounts(); track a.code) {
                      <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                    }
                  </select>
                </app-form-field>
              }

              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="form-field-label">Items</span>
                  <button appButton variant="ghost" type="button" (click)="addLine()">
                    <app-icon name="heroPlus" />
                    Add line
                  </button>
                </div>
                @for (line of lines; track $index) {
                  <div
                    class="grid gap-2 rounded-box border border-base-300 bg-base-200/50 p-3 sm:grid-cols-12"
                  >
                    <app-form-field label="Product" class="sm:col-span-5">
                      <select
                        class="select select-bordered select-sm w-full"
                        [(ngModel)]="line.variantId"
                        [ngModelOptions]="{ standalone: true }"
                      >
                        @for (v of variants(); track v.variant_id) {
                          <option [value]="v.variant_id">{{ label(v) }} ({{ v.sku }})</option>
                        }
                      </select>
                    </app-form-field>
                    <app-form-field label="Quantity" class="sm:col-span-2">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        class="input input-bordered input-sm w-full"
                        [(ngModel)]="line.quantity"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    <app-form-field label="Unit cost (KES)" class="sm:col-span-2">
                      <input
                        type="text"
                        inputmode="decimal"
                        class="input input-bordered input-sm w-full"
                        [(ngModel)]="line.unitCost"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    <app-form-field label="Expiry" class="sm:col-span-2">
                      <input
                        type="date"
                        class="input input-bordered input-sm w-full"
                        [(ngModel)]="line.expiryDate"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    <div class="flex items-end sm:col-span-1">
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        aria-label="Remove purchase line"
                        [disabled]="lines.length === 1"
                        (click)="removeLine($index)"
                      >
                        <app-icon name="heroXMark" />
                      </button>
                    </div>
                  </div>
                }
              </div>

              <div
                class="flex flex-wrap items-center gap-3 rounded-box border px-3 py-3"
                [class.border-warning]="purchaseOnCredit.value"
                [class.border-base-300]="!purchaseOnCredit.value"
                [class.bg-base-200]="true"
              >
                <div>
                  <p class="type-caption">Purchase total</p>
                  <p class="type-hero"><app-money [cents]="purchaseTotal()" /></p>
                </div>
                <p class="ml-auto max-w-sm text-right text-sm">
                  @if (purchaseOnCredit.value) {
                    This amount will be
                    <strong>added to {{ selectedSupplierName() }}'s balance</strong>.
                  } @else {
                    This is recorded as <strong>paid now</strong>; the supplier balance will not
                    change.
                  }
                </p>
              </div>

              <button
                appButton
                type="submit"
                class="self-start"
                [loading]="busy()"
                [disabled]="
                  suppliers().length === 0 ||
                  variants().length === 0 ||
                  (!purchaseOnCredit.value && !cashierSession.isOpen())
                "
              >
                {{ purchaseOnCredit.value ? 'Record credit purchase' : 'Record paid purchase' }}
              </button>
            </form>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <section class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="section-title">Supplier balances</h2>
                <span class="type-caption">Accounts payable</span>
              </div>
              @if (suppliers().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroTruck"
                  title="No suppliers yet"
                  description="Create a supplier to start recording purchases."
                />
              } @else {
                <div class="mt-1 flex flex-col divide-y divide-base-200">
                  @for (s of suppliers(); track s.id) {
                    <div class="flex items-center gap-3 py-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{{ name(s) }}</p>
                        <p class="type-caption">{{ s.phone || 'No phone' }}</p>
                      </div>
                      <div class="text-right">
                        <p class="text-sm font-semibold" [class.text-warning]="s.ap_balance > 0">
                          <app-money
                            [cents]="s.ap_balance"
                            [masked]="!perms.has('ViewFinancials')"
                          />
                        </p>
                        @if (s.days_outstanding !== null) {
                          <div class="mt-1 flex items-center justify-end gap-1">
                            <span class="type-caption">{{ s.days_outstanding }}d</span>
                            <span class="badge badge-xs" [class]="bucketBadge(s.bucket)">
                              {{ s.bucket }}
                            </span>
                          </div>
                        } @else {
                          <span class="type-caption">{{ s.ap_balance > 0 ? 'Due' : 'Clear' }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </section>

          @if (perms.has('ViewFinancials')) {
            <section class="card bg-base-100">
              <div class="card-body p-4">
                <h2 class="section-title">Pay down a balance</h2>
                @if (suppliersOwed().length === 0) {
                  <p class="mt-2 text-sm text-base-content/60">No supplier balances are due.</p>
                } @else {
                  @if (!cashierSession.isOpen()) {
                    <app-session-required-notice action="paying a supplier" />
                  }
                  <form
                    (submit)="$event.preventDefault(); paySupplier()"
                    class="mt-3 flex flex-col gap-3"
                  >
                    <app-form-field label="Supplier">
                      <select
                        class="select select-bordered select-sm w-full"
                        [formControl]="paySupplierId"
                      >
                        @for (s of suppliersOwed(); track s.id) {
                          <option [value]="s.id">
                            {{ name(s) }} — {{ fmt(s.ap_balance) }} due
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <app-form-field label="Amount (KES)">
                      <input
                        type="text"
                        inputmode="decimal"
                        class="input input-bordered input-sm w-full"
                        [formControl]="payAmount"
                      />
                    </app-form-field>
                    <app-form-field label="Pay from">
                      <select
                        class="select select-bordered select-sm w-full"
                        [formControl]="payAccount"
                      >
                        @for (a of accounts(); track a.code) {
                          <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
                        }
                      </select>
                    </app-form-field>
                    <button
                      appButton
                      type="submit"
                      [loading]="busy()"
                      [disabled]="!cashierSession.isOpen()"
                    >
                      Record supplier payment
                    </button>
                  </form>
                }
              </div>
            </section>
          }
        </aside>
      </div>

      <section class="mt-6">
        <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="section-title">Recent purchases</h2>
            <p class="type-caption mt-1">Paid-now purchases do not create a supplier balance.</p>
          </div>
        </div>
        @if (purchases().length === 0) {
          <app-empty-state
            icon="heroBanknotes"
            title="No purchases recorded"
            description="Record a purchase above to add supplier stock."
          />
        } @else {
          <div class="card overflow-hidden bg-base-100">
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Payment</th>
                    <th>Reference</th>
                    <th class="text-right">Total</th>
                    <th class="text-right">Status</th>
                    @if (printerEnabled()) {
                      <th></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (p of purchases(); track p.id) {
                    <tr>
                      <td class="whitespace-nowrap text-sm">{{ time(p.created_at) }}</td>
                      <td class="font-medium">{{ supplierName(p.supplier_id) }}</td>
                      <td class="text-sm">{{ p.is_credit ? 'Pay later' : 'Paid now' }}</td>
                      <td class="type-caption">{{ p.reference || '—' }}</td>
                      <td class="text-right font-semibold">
                        <app-money [cents]="p.total_cost" [masked]="!perms.has('ViewFinancials')" />
                      </td>
                      <td class="text-right">
                        <app-status-badge
                          [type]="purchaseStatusType(p)"
                          [label]="purchaseStatusLabel(p)"
                        />
                      </td>
                      @if (printerEnabled()) {
                        <td class="text-right">
                          <button appButton variant="ghost" (click)="printPurchase(p.id)">
                            Print PO
                          </button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>
    </app-page>
  `,
})
export class SuppliersComponent implements OnInit, OnDestroy {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly supabase = inject(SupabaseService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly fmt = formatKes;
  protected readonly String = String;
  protected readonly suppliers = signal<SupplierWithAp[]>([]);
  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly variants = signal<Variant[]>([]);
  protected readonly label = variantLabel;
  protected readonly purchases = signal<PurchaseRow[]>([]);
  protected readonly createOpen = signal(false);

  protected readonly newName = new FormControl('', { nonNullable: true });
  protected readonly newPhone = new FormControl('', { nonNullable: true });

  protected readonly purchaseSupplier = new FormControl('', { nonNullable: true });
  protected readonly purchaseReference = new FormControl('', { nonNullable: true });
  protected readonly purchaseOnCredit = new FormControl(false, { nonNullable: true });
  protected readonly purchaseAccount = new FormControl('', { nonNullable: true });
  protected lines: PurchaseLineForm[] = [this.emptyLine()];

  protected readonly paySupplierId = new FormControl('', { nonNullable: true });
  protected readonly payAmount = new FormControl('', { nonNullable: true });
  protected readonly payAccount = new FormControl('', { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);

  protected readonly totalOutstanding = computed(() =>
    this.suppliers().reduce((sum, supplier) => sum + Math.max(0, supplier.ap_balance), 0)
  );
  protected readonly suppliersOwed = computed(() =>
    this.suppliers().filter(supplier => supplier.ap_balance > 0)
  );
  protected readonly openCreditPurchases = computed(
    () =>
      this.purchases().filter(purchase => purchase.is_credit && purchase.paid < purchase.total_cost)
        .length
  );

  private liveChannel: RealtimeChannel | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private loadQueued = false;

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    await this.load();
    const companyId = this.supabase.claims()?.company_id;
    if (companyId) this.connectLiveUpdates(companyId);
  }

  ngOnDestroy(): void {
    if (this.liveChannel) void this.supabase.client.removeChannel(this.liveChannel);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  protected async load(): Promise<void> {
    if (this.loading()) {
      this.loadQueued = true;
      return;
    }
    this.loading.set(true);
    try {
      const [suppliers, accounts, variants, purchases] = await Promise.all([
        this.money.suppliersWithAp(),
        this.money.transactableAccounts(),
        this.pos.fetchActiveVariants(),
        this.money.purchasesWithPayments(),
      ]);
      this.suppliers.set(suppliers);
      this.accounts.set(accounts);
      // Purchases stock goods only (services are rejected server-side).
      this.variants.set(variants.filter(v => v.kind !== 'service'));
      this.purchases.set(purchases as PurchaseRow[]);
      if (!this.purchaseSupplier.value && suppliers.length > 0)
        this.purchaseSupplier.setValue(suppliers[0].id);
      const suppliersWithBalance = suppliers.filter(s => s.ap_balance > 0);
      if (
        suppliersWithBalance.length > 0 &&
        !suppliersWithBalance.some(s => s.id === this.paySupplierId.value)
      ) {
        this.paySupplierId.setValue(suppliersWithBalance[0].id);
      }
      if (!this.purchaseAccount.value && accounts.length > 0)
        this.purchaseAccount.setValue(accounts[0].code);
      if (!this.payAccount.value && accounts.length > 0) this.payAccount.setValue(accounts[0].code);
      if (this.lines.every(l => !l.variantId) && this.variants().length > 0)
        this.lines = [{ ...this.emptyLine(), variantId: this.variants()[0].variant_id ?? '' }];
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
      if (this.loadQueued) {
        this.loadQueued = false;
        void this.load();
      }
    }
  }

  protected setPurchaseCredit(value: boolean): void {
    if (value && !this.perms.has('ManageSupplierCreditPurchases')) return;
    this.purchaseOnCredit.setValue(value);
  }

  protected selectedSupplierName(): string {
    const supplier = this.suppliers().find(s => s.id === this.purchaseSupplier.value);
    return supplier ? this.name(supplier) : 'the supplier';
  }

  protected purchaseTotal(): number {
    return this.lines.reduce((sum, l) => {
      const cents = parseKesToCents(l.unitCost || '0');
      return sum + Math.round((l.quantity || 0) * (cents ?? 0));
    }, 0);
  }

  protected addLine(): void {
    this.lines = [
      ...this.lines,
      { ...this.emptyLine(), variantId: this.variants()[0]?.variant_id ?? '' },
    ];
  }

  protected removeLine(index: number): void {
    this.lines = this.lines.filter((_, i) => i !== index);
  }

  protected async recordPurchase(): Promise<void> {
    if (!this.purchaseOnCredit.value) {
      try {
        await this.cashierSession.assertOpen('recording a paid purchase');
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
        return;
      }
    }
    const parsed: {
      variant_id: string;
      quantity: number;
      unit_cost: number;
      expiry_date?: string;
    }[] = [];
    for (const l of this.lines) {
      const unitCost = parseKesToCents(l.unitCost);
      if (!l.variantId || !(l.quantity > 0) || unitCost === null) {
        this.error.set('Every line needs a variant, a quantity, and a valid unit cost');
        return;
      }
      parsed.push({
        variant_id: l.variantId,
        quantity: l.quantity,
        unit_cost: unitCost,
        ...(l.expiryDate ? { expiry_date: l.expiryDate } : {}),
      });
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const isCredit = this.purchaseOnCredit.value;
      const total = this.purchaseTotal();
      const supplierName = this.selectedSupplierName();
      await this.money.recordPurchase(
        this.purchaseSupplier.value,
        parsed,
        isCredit,
        this.purchaseReference.value.trim() || undefined,
        isCredit ? undefined : this.purchaseAccount.value
      );
      this.purchaseReference.setValue('');
      this.lines = [{ ...this.emptyLine(), variantId: this.variants()[0]?.variant_id ?? '' }];
      await this.load();
      this.notice.set(
        isCredit
          ? `Credit purchase recorded. ${this.fmt(total)} was added to ${supplierName}'s balance.`
          : 'Paid purchase recorded. The supplier balance was not changed.'
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to record purchase');
    } finally {
      this.busy.set(false);
    }
  }

  protected async paySupplier(): Promise<void> {
    try {
      await this.cashierSession.assertOpen('paying a supplier');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    const cents = parseKesToCents(this.payAmount.value);
    if (cents === null || cents <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const supplierName = this.supplierName(this.paySupplierId.value);
      await this.money.paySupplier(this.paySupplierId.value, cents, this.payAccount.value);
      this.payAmount.setValue('');
      await this.load();
      this.notice.set(`${this.fmt(cents)} payment recorded for ${supplierName}.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async createSupplier(): Promise<void> {
    if (this.newName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.createCustomer(
        this.newName.value.trim(),
        undefined,
        this.newPhone.value.trim() || undefined,
        undefined,
        true
      );
      this.notice.set('Supplier created');
      this.newName.setValue('');
      this.newPhone.setValue('');
      this.createOpen.set(false);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async printPurchase(purchaseId: string): Promise<void> {
    try {
      const [purchase, company] = await Promise.all([
        this.receiptData.buildPurchaseData(purchaseId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printPurchase(purchase, company.name, company.logoUrl);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected bucketBadge(bucket: string | null): string {
    switch (bucket) {
      case '8-30':
        return 'badge-info';
      case '31-60':
        return 'badge-warning';
      case '60+':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  }

  protected purchaseStatusType(purchase: PurchaseRow): BadgeType {
    if (!purchase.is_credit || purchase.paid >= purchase.total_cost) return 'success';
    return 'warning';
  }

  protected purchaseStatusLabel(purchase: PurchaseRow): string {
    if (!purchase.is_credit) return 'Paid now';
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    if (!this.perms.has('ViewFinancials')) return purchase.paid > 0 ? 'Part-paid' : 'Payment due';
    const due = this.fmt(purchase.total_cost - purchase.paid);
    return purchase.paid > 0 ? `Part-paid · ${due} due` : `${due} due`;
  }

  protected supplierName(id: string): string {
    const s = this.suppliers().find(x => x.id === id);
    return s ? this.name(s) : id.slice(0, 8);
  }

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
    });
  }

  private connectLiveUpdates(companyId: string): void {
    this.liveChannel = this.supabase.client
      .channel(`suppliers-live-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchases',
          filter: `company_id=eq.${companyId}`,
        },
        () => this.queueLiveRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_payments',
          filter: `company_id=eq.${companyId}`,
        },
        () => this.queueLiveRefresh()
      )
      .subscribe();
  }

  private queueLiveRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.load();
    }, 250);
  }

  private emptyLine(): PurchaseLineForm {
    return { variantId: '', quantity: 1, unitCost: '', expiryDate: '' };
  }
}
