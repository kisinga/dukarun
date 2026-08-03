import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { parseKesToCents } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { AgingInfo, MoneyCustomer, MoneyService } from '../money/money.service';
import { OrderWithCustomer, PosService } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { MobileFabComponent } from '../shared/ui/mobile-fab.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';

type CustomerWithAr = MoneyCustomer & { ar_balance: number } & AgingInfo;
type CreditOrder = {
  id: string;
  code: string;
  total: number;
  status: string;
  created_at: string;
};

@Component({
  selector: 'app-customers',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    FormFieldComponent,
    ButtonComponent,
    MoneyComponent,
    IconComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    MobileFabComponent,
    ListSearchBarComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-page title="Customers">
      <button actions appButton (click)="startCreate()">
        <app-icon name="heroPlus" /> New customer
      </button>

      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="mb-2 text-sm text-success">{{ notice() }}</p>
      }

      <!-- Create / edit panel -->
      @if (formOpen()) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h2 class="section-title mb-2">
              {{ editing() ? 'Edit ' + name(editing()!) : 'New customer' }}
            </h2>
            <form (submit)="$event.preventDefault(); save()" class="grid gap-3 sm:grid-cols-2">
              <app-form-field label="First name" [required]="true">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  [formControl]="firstName"
                />
              </app-form-field>
              <app-form-field label="Last name">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  [formControl]="lastName"
                />
              </app-form-field>
              <app-form-field label="Phone">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  [formControl]="phone"
                />
              </app-form-field>
              <app-form-field label="Email">
                <input
                  type="email"
                  class="input input-bordered input-sm w-full"
                  [formControl]="email"
                />
              </app-form-field>
              <app-form-field label="Notes" class="sm:col-span-2">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  [formControl]="notes"
                />
              </app-form-field>
              <div class="flex gap-2 sm:col-span-2">
                <button
                  appButton
                  type="submit"
                  [loading]="busy()"
                  [disabled]="firstName.value.trim().length === 0"
                >
                  {{ editing() ? 'Save changes' : 'Create customer' }}
                </button>
                <button appButton variant="ghost" type="button" (click)="closeForm()">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Search -->
      <div class="mb-3">
        <app-list-search-bar placeholder="Search name or phone…" [(searchQuery)]="query" />
      </div>

      <!-- List -->
      @if (filtered().length === 0) {
        <app-empty-state
          icon="heroUsers"
          title="No customers found"
          description="Add a customer with the + button to sell on credit, or clear the search."
        />
      } @else {
        <div class="flex flex-col gap-2">
          @for (c of filtered(); track c.id) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <app-entity-avatar
                    size="sm"
                    [firstName]="c.first_name"
                    [lastName]="c.last_name ?? ''"
                  />
                  <button class="link font-semibold" (click)="toggle(c.id)">{{ name(c) }}</button>
                  <span class="text-xs text-base-content/60">{{ c.phone ?? '' }}</span>
                  <span
                    class="ml-auto"
                    [class.font-bold]="c.ar_balance > 0"
                    [class.text-error]="c.ar_balance > 0"
                    [class.text-base-content/60]="c.ar_balance === 0"
                  >
                    <app-money [cents]="c.ar_balance" [masked]="!perms.has('ViewFinancials')" />
                    owed
                  </span>
                  <button appButton variant="ghost" (click)="startEdit(c)">Edit</button>
                </div>

                @if (expandedFor() === c.id) {
                  <div class="mt-3 grid gap-4 border-t pt-3 lg:grid-cols-2">
                    <!-- Credit status + settings -->
                    <div>
                      <h3 class="section-title mb-2">Credit</h3>
                      <div class="flex flex-wrap items-center gap-3">
                        <app-status-badge
                          type="neutral"
                          [label]="c.is_credit_approved ? 'approved' : 'not approved'"
                        />
                        <span class="type-caption">
                          limit
                          <app-money
                            [cents]="c.credit_limit"
                            [masked]="!perms.has('ViewFinancials')"
                          />
                        </span>
                        <span class="type-caption">{{ c.credit_terms_days ?? 0 }}d terms</span>
                        @if (c.days_outstanding !== null) {
                          <span class="type-caption">{{ c.days_outstanding }}d</span>
                          <span class="badge badge-xs" [class]="bucketBadge(c.bucket)">
                            {{ c.bucket }}
                          </span>
                        }
                      </div>
                      @if (
                        perms.has('ApproveCustomerCredit') || perms.has('ManageCustomerCreditLimit')
                      ) {
                        <form
                          (submit)="$event.preventDefault(); saveCredit(c)"
                          class="mt-3 flex flex-col gap-2"
                        >
                          <app-form-field label="Credit limit (KES)">
                            <input
                              type="text"
                              inputmode="decimal"
                              class="input input-bordered input-sm w-full"
                              [formControl]="creditLimit"
                            />
                          </app-form-field>
                          <app-form-field label="Terms (days)">
                            <input
                              type="number"
                              class="input input-bordered input-sm w-full"
                              [formControl]="termsDays"
                            />
                          </app-form-field>
                          <label class="label cursor-pointer justify-start gap-2">
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              [formControl]="approved"
                            />
                            <span class="label-text">Approved for credit</span>
                          </label>
                          <button
                            appButton
                            variant="outline"
                            type="submit"
                            class="self-start"
                            [disabled]="busy()"
                          >
                            Save settings
                          </button>
                        </form>
                      }
                    </div>

                    <!-- Credit orders + repayment -->
                    <div>
                      <h3 class="section-title mb-2">Credit orders</h3>
                      @if (creditOrders().length === 0) {
                        <p class="text-xs text-base-content/60">No credit sales.</p>
                      } @else {
                        @for (o of creditOrders(); track o.id) {
                          <div class="flex items-center gap-2 py-1 text-sm">
                            <span class="font-mono">{{ o.code }}</span>
                            <span class="text-xs text-base-content/60">{{
                              date(o.created_at)
                            }}</span>
                            <span class="badge badge-xs badge-outline">{{ o.status }}</span>
                            <span class="ml-auto font-semibold"
                              ><app-money [cents]="o.total" [masked]="!perms.has('ViewFinancials')"
                            /></span>
                            @if (perms.has('SettleOrder')) {
                              <button appButton (click)="startRepay(o.id, o.total)">Repay</button>
                            }
                          </div>
                          @if (repayFor() === o.id) {
                            <form
                              (submit)="$event.preventDefault(); repay(o.id)"
                              class="mb-2 flex flex-wrap items-end gap-2 rounded bg-base-200 p-2"
                            >
                              <app-form-field label="Amount (KES)">
                                <input
                                  type="text"
                                  inputmode="decimal"
                                  class="input input-bordered input-xs w-24"
                                  [formControl]="repayAmount"
                                />
                              </app-form-field>
                              <app-form-field label="Method">
                                <select
                                  class="select select-bordered select-xs"
                                  [formControl]="repayMethod"
                                >
                                  @for (m of methods(); track m) {
                                    <option [value]="m">{{ m }}</option>
                                  }
                                </select>
                              </app-form-field>
                              <app-form-field label="Reference">
                                <input
                                  type="text"
                                  class="input input-bordered input-xs w-28"
                                  [formControl]="repayReference"
                                />
                              </app-form-field>
                              <button appButton type="submit" [disabled]="busy()">Allocate</button>
                              <button
                                appButton
                                variant="ghost"
                                type="button"
                                (click)="repayFor.set(null)"
                              >
                                Cancel
                              </button>
                            </form>
                          }
                        }
                      }
                    </div>
                  </div>

                  <!-- Order history -->
                  <div class="mt-3 border-t pt-3">
                    <h3 class="section-title mb-2">Order history</h3>
                    @if (orders().length === 0) {
                      <p class="text-xs text-base-content/60">No orders yet.</p>
                    } @else {
                      <table class="table table-xs">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th class="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (o of orders(); track o.id) {
                            <tr>
                              <td class="font-mono">{{ o.code }}</td>
                              <td>{{ date(o.created_at) }}</td>
                              <td>
                                <span class="badge badge-xs badge-outline">{{ o.status }}</span>
                                @if (o.is_credit_sale) {
                                  <span class="badge badge-xs badge-warning">credit</span>
                                }
                              </td>
                              <td class="text-right">
                                <app-money
                                  [cents]="o.total"
                                  [masked]="!perms.has('ViewFinancials')"
                                />
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <app-mobile-fab ariaLabel="New customer" (fabClick)="startCreate()" />
    </app-page>
  `,
})
export class CustomersComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  protected readonly perms = inject(PermissionsService);

  protected readonly customers = signal<CustomerWithAr[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly creditOrders = signal<CreditOrder[]>([]);
  protected readonly methods = signal<string[]>(['cash', 'mpesa', 'bank']);
  protected readonly repayFor = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CustomerWithAr | null>(null);

  protected readonly firstName = new FormControl('', { nonNullable: true });
  protected readonly lastName = new FormControl('', { nonNullable: true });
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });

  protected readonly repayAmount = new FormControl('', { nonNullable: true });
  protected readonly repayMethod = new FormControl('cash', { nonNullable: true });
  protected readonly repayReference = new FormControl('', { nonNullable: true });

  protected readonly creditLimit = new FormControl('', { nonNullable: true });
  protected readonly termsDays = new FormControl(0, { nonNullable: true });
  protected readonly approved = new FormControl(false, { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly filtered = computed(() => {
    const q = this.query().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter(
      c => this.name(c).toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
    );
  });

  async ngOnInit(): Promise<void> {
    try {
      this.methods.set(await this.money.enabledMethodCodes());
    } catch {
      // keep defaults
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.customers.set(await this.money.customersWithAr());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load customers');
    }
  }

  protected async toggle(customerId: string): Promise<void> {
    if (this.expandedFor() === customerId) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(customerId);
    this.repayFor.set(null);
    const customer = this.customers().find(c => c.id === customerId);
    if (customer) {
      this.creditLimit.setValue((customer.credit_limit / 100).toFixed(2));
      this.termsDays.setValue(customer.credit_terms_days ?? 0);
      this.approved.setValue(customer.is_credit_approved);
    }
    try {
      const [orders, creditOrders] = await Promise.all([
        this.pos.customerOrders(customerId),
        this.money.creditOrders(customerId),
      ]);
      this.orders.set(orders);
      this.creditOrders.set(creditOrders);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load orders');
    }
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.firstName.setValue('');
    this.lastName.setValue('');
    this.phone.setValue('');
    this.email.setValue('');
    this.notes.setValue('');
    this.formOpen.set(true);
  }

  protected startEdit(c: CustomerWithAr): void {
    this.editing.set(c);
    this.firstName.setValue(c.first_name);
    this.lastName.setValue(c.last_name ?? '');
    this.phone.setValue(c.phone ?? '');
    this.email.setValue(c.email ?? '');
    this.notes.setValue(c.notes ?? '');
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async save(): Promise<void> {
    if (this.firstName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editing();
      if (editing) {
        await this.money.updateCustomer(editing.id, {
          first_name: this.firstName.value.trim(),
          last_name: this.lastName.value.trim() || undefined,
          phone: this.phone.value.trim() || undefined,
          email: this.email.value.trim() || undefined,
          notes: this.notes.value.trim() || undefined,
        });
        this.notice.set(`Updated ${this.firstName.value.trim()}`);
      } else {
        await this.money.createCustomer(
          this.firstName.value.trim(),
          this.lastName.value.trim() || undefined,
          this.phone.value.trim() || undefined,
          this.email.value.trim() || undefined
        );
        this.notice.set(`Created ${this.firstName.value.trim()}`);
      }
      this.closeForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startRepay(orderId: string, total: number): void {
    this.repayFor.set(orderId);
    this.repayAmount.setValue((total / 100).toFixed(2));
    this.repayReference.setValue('');
  }

  protected async repay(orderId: string): Promise<void> {
    const cents = parseKesToCents(this.repayAmount.value);
    if (cents === null || cents <= 0) {
      this.error.set('Enter a valid repayment amount');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postPaymentAllocation(
        orderId,
        cents,
        this.repayMethod.value,
        this.repayReference.value.trim() || undefined
      );
      this.notice.set('Repayment allocated');
      this.repayFor.set(null);
      await this.load();
      const current = this.customers().find(c => c.id === this.expandedFor());
      if (current) this.creditOrders.set(await this.money.creditOrders(current.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Repayment failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveCredit(c: CustomerWithAr): Promise<void> {
    const limitCents = parseKesToCents(this.creditLimit.value);
    if (limitCents === null) {
      this.error.set('Enter a valid credit limit');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.updateCustomerCredit(
        c.id,
        limitCents,
        this.approved.value,
        this.termsDays.value > 0 ? this.termsDays.value : undefined
      );
      this.notice.set(`Credit settings saved for ${this.name(c)}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
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

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
