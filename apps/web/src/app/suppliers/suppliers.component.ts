import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../core/money';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { AgingInfo, LedgerAccount, MoneyCustomer, MoneyService } from '../money/money.service';

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
    PageLayoutComponent,
  ],
  template: `
    <app-page title="Suppliers">
      <button actions appButton variant="ghost" (click)="load()">Refresh</button>

      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="mb-2 text-sm text-success">{{ notice() }}</p>
      }

    <!-- Supplier list -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <div class="flex items-center justify-between">
          <h2 class="section-title">Suppliers</h2>
          <button appButton variant="ghost" (click)="createOpen.set(!createOpen())">
            {{ createOpen() ? '− Cancel' : '+ New supplier' }}
          </button>
        </div>
        @if (createOpen()) {
          <form
            (submit)="$event.preventDefault(); createSupplier()"
            class="mt-2 flex flex-wrap gap-2"
          >
            <input
              type="text"
              class="input input-bordered input-sm"
              placeholder="Name *"
              [formControl]="newName"
            />
            <input
              type="text"
              class="input input-bordered input-sm"
              placeholder="Phone"
              [formControl]="newPhone"
            />
            <button
              appButton
              type="submit"
              [disabled]="busy() || newName.value.trim().length === 0"
            >
              Create
            </button>
          </form>
        }
        @if (suppliers().length === 0) {
          <p class="mt-2 text-sm text-base-content/60">No suppliers yet.</p>
        } @else {
          <table class="table table-sm mt-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th class="text-right">Owed (AP)</th>
              </tr>
            </thead>
            <tbody>
              @for (s of suppliers(); track s.id) {
                <tr>
                  <td class="font-medium">{{ name(s) }}</td>
                  <td class="text-xs text-base-content/60">{{ s.phone }}</td>
                  <td
                    class="text-right font-semibold tabular-nums"
                    [class.text-error]="s.ap_balance > 0"
                  >
                    <app-money [cents]="s.ap_balance" />
                    @if (s.days_outstanding !== null) {
                      <div class="flex items-center justify-end gap-1">
                        <span class="type-caption">{{ s.days_outstanding }}d</span>
                        <span class="badge badge-xs" [class]="bucketBadge(s.bucket)">
                          {{ s.bucket }}
                        </span>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    <!-- Record purchase -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Record purchase</h2>
        <form
          (submit)="$event.preventDefault(); recordPurchase()"
          class="mt-2 flex flex-col gap-3"
        >
          <div class="grid gap-3 sm:grid-cols-3">
            <app-form-field label="Supplier">
              <select
                class="select select-bordered select-sm w-full"
                [formControl]="purchaseSupplier"
              >
                @for (s of suppliers(); track s.id) {
                  <option [value]="s.id">{{ name(s) }}</option>
                }
              </select>
            </app-form-field>
            <app-form-field label="Reference">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                placeholder="Invoice #"
                [formControl]="purchaseReference"
              />
            </app-form-field>
            <label class="label cursor-pointer justify-start gap-2 self-end">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [formControl]="purchaseOnCredit"
              />
              <span class="label-text">Buy on credit</span>
            </label>
          </div>

          @if (!purchaseOnCredit.value) {
            <app-form-field label="Paid from" class="sm:w-1/3">
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

          <!-- Lines -->
          <div class="flex flex-col gap-2">
            @for (line of lines; track $index) {
              <div class="flex flex-wrap items-end gap-2 rounded bg-base-200 p-2">
                <app-form-field label="Product" class="flex-1 min-w-40">
                  <select
                    class="select select-bordered select-xs w-full"
                    [(ngModel)]="line.variantId"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    @for (v of variants(); track v.variant_id) {
                      <option [value]="v.variant_id">{{ label(v) }} ({{ v.sku }})</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="Qty" class="w-20">
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    class="input input-bordered input-xs w-full"
                    [(ngModel)]="line.quantity"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </app-form-field>
                <app-form-field label="Unit cost (KES)" class="w-24">
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-bordered input-xs w-full"
                    [(ngModel)]="line.unitCost"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </app-form-field>
                <app-form-field label="Expiry (optional)" class="w-32">
                  <input
                    type="date"
                    class="input input-bordered input-xs w-full"
                    [(ngModel)]="line.expiryDate"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </app-form-field>
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  [disabled]="lines.length === 1"
                  (click)="removeLine($index)"
                >
                  <app-icon name="heroXMark" />
                </button>
              </div>
            }
            <button appButton variant="ghost" type="button" class="self-start" (click)="addLine()">
              + Add line
            </button>
          </div>

          <div class="text-sm font-semibold tabular-nums">
            Total: <app-money [cents]="purchaseTotal()" />
          </div>
          <button
            appButton
            type="submit"
            class="self-start"
            [loading]="busy()"
            [disabled]="suppliers().length === 0 || variants().length === 0"
          >
            Record purchase
          </button>
        </form>
      </div>
    </div>

    <!-- Pay supplier -->
    <div class="card mb-4 bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title mb-2">Pay supplier</h2>
        <form
          (submit)="$event.preventDefault(); paySupplier()"
          class="mt-2 flex flex-wrap items-end gap-3"
        >
          <app-form-field label="Supplier">
            <select class="select select-bordered select-sm" [formControl]="paySupplierId">
              @for (s of suppliers(); track s.id) {
                <option [value]="s.id">{{ name(s) }} ({{ fmt(s.ap_balance) }} owed)</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Amount (KES)">
            <input
              type="text"
              inputmode="decimal"
              class="input input-bordered input-sm w-28"
              [formControl]="payAmount"
            />
          </app-form-field>
          <app-form-field label="From">
            <select class="select select-bordered select-sm" [formControl]="payAccount">
              @for (a of accounts(); track a.code) {
                <option [value]="a.code">{{ a.code }} — {{ a.name }}</option>
              }
            </select>
          </app-form-field>
          <button appButton type="submit" [loading]="busy()" [disabled]="suppliers().length === 0">
            Pay
          </button>
        </form>
      </div>
    </div>

    <!-- Purchases list -->
    <h2 class="section-title mb-2">Recent purchases</h2>
    @if (purchases().length === 0) {
      <app-empty-state
        icon="heroBanknotes"
        title="No purchases recorded"
        description="Record a purchase above to stock in from a supplier."
      />
    } @else {
      <div class="flex flex-col gap-2">
        @for (p of purchases(); track p.id) {
          <div class="card bg-base-100">
            <div class="card-body flex-row flex-wrap items-center gap-3 p-4">
              <span class="text-sm">{{ time(p.created_at) }}</span>
              <span class="text-sm font-medium">{{ supplierName(p.supplier_id) }}</span>
              @if (p.reference) {
                <span class="text-xs text-base-content/60">ref {{ p.reference }}</span>
              }
              @if (p.is_credit) {
                <app-status-badge type="warning" label="credit" />
              }
              <span class="ml-auto font-bold tabular-nums"
                ><app-money [cents]="p.total_cost"
              /></span>
              <app-status-badge
                [type]="p.paid >= p.total_cost ? 'success' : 'error'"
                [label]="
                  p.paid >= p.total_cost
                    ? 'paid'
                    : 'unpaid (' + fmt(p.total_cost - p.paid) + ')'
                "
              />
              @if (printerEnabled()) {
                <button appButton variant="ghost" (click)="printPurchase(p.id)">Print PO</button>
              }
            </div>
          </div>
        }
      </div>
    }
    </app-page>
  `,
})
export class SuppliersComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly fmt = formatKes;
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
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    await this.load();
  }

  protected async load(): Promise<void> {
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
      if (!this.paySupplierId.value && suppliers.length > 0)
        this.paySupplierId.setValue(suppliers[0].id);
      if (!this.purchaseAccount.value && accounts.length > 0)
        this.purchaseAccount.setValue(accounts[0].code);
      if (!this.payAccount.value && accounts.length > 0) this.payAccount.setValue(accounts[0].code);
      if (this.lines.every(l => !l.variantId) && this.variants().length > 0)
        this.lines = [{ ...this.emptyLine(), variantId: this.variants()[0].variant_id ?? '' }];
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
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
      await this.money.recordPurchase(
        this.purchaseSupplier.value,
        parsed,
        this.purchaseOnCredit.value,
        this.purchaseReference.value.trim() || undefined,
        this.purchaseOnCredit.value ? undefined : this.purchaseAccount.value
      );
      this.notice.set('Purchase recorded');
      this.purchaseReference.setValue('');
      this.lines = [{ ...this.emptyLine(), variantId: this.variants()[0]?.variant_id ?? '' }];
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to record purchase');
    } finally {
      this.busy.set(false);
    }
  }

  protected async paySupplier(): Promise<void> {
    const cents = parseKesToCents(this.payAmount.value);
    if (cents === null || cents <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.paySupplier(this.paySupplierId.value, cents, this.payAccount.value);
      this.notice.set('Supplier paid');
      this.payAmount.setValue('');
      await this.load();
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

  protected supplierName(id: string): string {
    const s = this.suppliers().find(x => x.id === id);
    return s ? this.name(s) : id.slice(0, 8);
  }

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }

  private emptyLine(): PurchaseLineForm {
    return { variantId: '', quantity: 1, unitCost: '', expiryDate: '' };
  }
}
