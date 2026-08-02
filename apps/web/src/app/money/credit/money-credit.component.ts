import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes, parseKesToCents } from '../../core/money';
import { AgingInfo, MoneyCustomer, MoneyService } from '../money.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type CustomerWithAr = MoneyCustomer & { ar_balance: number } & AgingInfo;
type CreditOrder = {
  id: string;
  code: string;
  total: number;
  status: string;
  created_at: string;
};

@Component({
  selector: 'app-money-credit',
  imports: [ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Customer Credit">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        <!-- Create customer -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <button class="btn btn-ghost btn-sm self-start" (click)="toggleCreate()">
              {{ createOpen() ? '− Cancel' : '+ New customer' }}
            </button>
            @if (createOpen()) {
              <form
                (submit)="$event.preventDefault(); createCustomer()"
                class="mt-2 grid gap-3 sm:grid-cols-3"
              >
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="First name *"
                  [formControl]="newFirstName"
                />
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="Last name"
                  [formControl]="newLastName"
                />
                <input
                  type="text"
                  class="input input-bordered input-sm"
                  placeholder="Phone"
                  [formControl]="newPhone"
                />
                <button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  [disabled]="busy() || newFirstName.value.trim().length === 0"
                >
                  {{ busy() ? 'Creating…' : 'Create customer' }}
                </button>
              </form>
            }
          </div>
        </div>

        <!-- Customers with AR -->
        <div class="mb-2 flex items-center gap-2">
          <span class="type-caption">Sort</span>
          <select
            class="select select-bordered select-xs"
            [value]="sortBy()"
            (change)="sortBy.set($any($event.target).value)"
          >
            <option value="name">Name</option>
            <option value="days">Days outstanding</option>
          </select>
        </div>

        @if (sortedCustomers().length === 0) {
          <app-empty-state icon="heroUsers" title="No customers yet." />
        } @else {
          <div class="flex flex-col gap-2">
            @for (c of sortedCustomers(); track c.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <button class="font-semibold link" (click)="toggle(c)">
                      {{ name(c) }}
                    </button>
                    <span class="text-xs text-base-content/60">{{ c.phone }}</span>
                    <app-status-badge
                      [type]="c.is_credit_approved ? 'success' : 'neutral'"
                      [label]="c.is_credit_approved ? 'approved' : 'not approved'"
                    />
                    <span class="text-xs text-base-content/60">
                      limit {{ fmt(c.credit_limit) }}
                    </span>
                    @if (c.days_outstanding !== null) {
                      <span class="type-caption">{{ c.days_outstanding }}d</span>
                      <span class="badge badge-xs" [class]="bucketBadge(c.bucket)">
                        {{ c.bucket }}
                      </span>
                    }
                    <span
                      class="ml-auto font-bold tabular-nums"
                      [class.text-error]="c.ar_balance > 0"
                    >
                      {{ fmt(c.ar_balance) }} owed
                    </span>
                  </div>

                  @if (expandedFor() === c.id) {
                    <div class="mt-3 grid gap-4 border-t pt-3 lg:grid-cols-2">
                      <!-- Credit orders + repayment -->
                      <div>
                        <h3 class="mb-1 text-sm font-semibold">Credit orders</h3>
                        @if (orders().length === 0) {
                          <p class="text-xs text-base-content/60">No credit sales.</p>
                        } @else {
                          @for (o of orders(); track o.id) {
                            <div class="flex items-center gap-2 py-1 text-sm">
                              <span class="font-mono">{{ o.code }}</span>
                              <span class="text-xs text-base-content/60">{{
                                time(o.created_at)
                              }}</span>
                              <span class="badge badge-xs badge-outline">{{ o.status }}</span>
                              <span class="ml-auto font-semibold">{{ fmt(o.total) }}</span>
                              <button
                                class="btn btn-primary btn-xs"
                                (click)="startRepay(o.id, o.total)"
                              >
                                Repay
                              </button>
                            </div>
                            @if (repayFor() === o.id) {
                              <form
                                (submit)="$event.preventDefault(); repay(o.id)"
                                class="mb-2 flex flex-wrap items-end gap-2 rounded bg-base-200 p-2"
                              >
                                <label class="form-control">
                                  <span class="label-text text-xs">Amount (KES)</span>
                                  <input
                                    type="text"
                                    inputmode="decimal"
                                    class="input input-bordered input-xs w-24"
                                    [formControl]="repayAmount"
                                  />
                                </label>
                                <label class="form-control">
                                  <span class="label-text text-xs">Method</span>
                                  <select
                                    class="select select-bordered select-xs"
                                    [formControl]="repayMethod"
                                  >
                                    @for (m of methods(); track m) {
                                      <option [value]="m">{{ m }}</option>
                                    }
                                  </select>
                                </label>
                                <label class="form-control">
                                  <span class="label-text text-xs">Reference</span>
                                  <input
                                    type="text"
                                    class="input input-bordered input-xs w-28"
                                    [formControl]="repayReference"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  class="btn btn-primary btn-xs"
                                  [disabled]="busy()"
                                >
                                  Allocate
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs"
                                  (click)="repayFor.set(null)"
                                >
                                  Cancel
                                </button>
                              </form>
                            }
                          }
                        }
                      </div>

                      <!-- Credit settings -->
                      <div>
                        <h3 class="mb-1 text-sm font-semibold">Credit settings</h3>
                        <form
                          (submit)="$event.preventDefault(); saveCredit(c)"
                          class="flex flex-col gap-2"
                        >
                          <label class="form-control">
                            <span class="label-text text-xs">Credit limit (KES)</span>
                            <input
                              type="text"
                              inputmode="decimal"
                              class="input input-bordered input-sm"
                              [formControl]="creditLimit"
                            />
                          </label>
                          <label class="form-control">
                            <span class="label-text text-xs">Terms (days)</span>
                            <input
                              type="number"
                              class="input input-bordered input-sm"
                              [formControl]="termsDays"
                            />
                          </label>
                          <label class="label cursor-pointer justify-start gap-2">
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              [formControl]="approved"
                            />
                            <span class="label-text">Approved for credit</span>
                          </label>
                          <button
                            type="submit"
                            class="btn btn-outline btn-sm self-start"
                            [disabled]="busy()"
                          >
                            Save settings
                          </button>
                        </form>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </main>
  `,
})
export class MoneyCreditComponent implements OnInit {
  private readonly money = inject(MoneyService);

  protected readonly fmt = formatKes;
  protected readonly customers = signal<CustomerWithAr[]>([]);
  protected readonly methods = signal<string[]>(['cash', 'mpesa', 'bank']);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly orders = signal<CreditOrder[]>([]);
  protected readonly repayFor = signal<string | null>(null);
  protected readonly createOpen = signal(false);

  protected readonly newFirstName = new FormControl('', { nonNullable: true });
  protected readonly newLastName = new FormControl('', { nonNullable: true });
  protected readonly newPhone = new FormControl('', { nonNullable: true });

  protected readonly repayAmount = new FormControl('', { nonNullable: true });
  protected readonly repayMethod = new FormControl('cash', { nonNullable: true });
  protected readonly repayReference = new FormControl('', { nonNullable: true });

  protected readonly creditLimit = new FormControl('', { nonNullable: true });
  protected readonly termsDays = new FormControl(0, { nonNullable: true });
  protected readonly approved = new FormControl(false, { nonNullable: true });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

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

  protected readonly sortBy = signal<'name' | 'days'>('name');

  protected readonly sortedCustomers = computed(() => {
    const list = this.customers();
    if (this.sortBy() === 'days') {
      return [...list].sort((a, b) => (b.days_outstanding ?? -1) - (a.days_outstanding ?? -1));
    }
    return list;
  });

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

  protected async toggle(c: CustomerWithAr): Promise<void> {
    if (this.expandedFor() === c.id) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(c.id);
    this.repayFor.set(null);
    this.creditLimit.setValue((c.credit_limit / 100).toFixed(2));
    this.termsDays.setValue(c.credit_terms_days ?? 0);
    this.approved.setValue(c.is_credit_approved);
    try {
      this.orders.set(await this.money.creditOrders(c.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load orders');
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
      if (current) this.orders.set(await this.money.creditOrders(current.id));
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

  protected toggleCreate(): void {
    this.createOpen.update(open => !open);
  }

  protected async createCustomer(): Promise<void> {
    if (this.newFirstName.value.trim().length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.createCustomer(
        this.newFirstName.value.trim(),
        this.newLastName.value.trim() || undefined,
        this.newPhone.value.trim() || undefined
      );
      this.notice.set('Customer created');
      this.newFirstName.setValue('');
      this.newLastName.setValue('');
      this.newPhone.setValue('');
      this.createOpen.set(false);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
