import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { MobileFabComponent } from '../shared/ui/mobile-fab.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { MoneyCustomer, MoneyService } from '../money/money.service';
import { OrderWithCustomer, PosService } from '../pos/pos.service';

type CustomerWithAr = MoneyCustomer & { ar_balance: number };

@Component({
  selector: 'app-customers',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    EntityAvatarComponent,
    MobileFabComponent,
    ListSearchBarComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Customers" backLink="/dashboard" backLabel="Dashboard">
          <button actions class="btn btn-primary btn-sm ml-auto" (click)="startCreate()">
            + New customer
          </button>
        </app-page-header>

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
              <h2 class="card-title text-lg">
                {{ editing() ? 'Edit ' + name(editing()!) : 'New customer' }}
              </h2>
              <form
                (submit)="$event.preventDefault(); save()"
                class="mt-2 grid gap-3 sm:grid-cols-2"
              >
                <label class="form-control">
                  <span class="label-text">First name *</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="firstName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Last name</span>
                  <input
                    type="text"
                    class="input input-bordered input-sm"
                    [formControl]="lastName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text">Phone</span>
                  <input type="text" class="input input-bordered input-sm" [formControl]="phone" />
                </label>
                <label class="form-control">
                  <span class="label-text">Email</span>
                  <input type="email" class="input input-bordered input-sm" [formControl]="email" />
                </label>
                <label class="form-control sm:col-span-2">
                  <span class="label-text">Notes</span>
                  <input type="text" class="input input-bordered input-sm" [formControl]="notes" />
                </label>
                <div class="flex gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() || firstName.value.trim().length === 0"
                  >
                    {{ busy() ? 'Saving…' : editing() ? 'Save changes' : 'Create customer' }}
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">
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
                      class="ml-auto tabular-nums"
                      [class.font-bold]="c.ar_balance > 0"
                      [class.text-error]="c.ar_balance > 0"
                      [class.text-base-content/60]="c.ar_balance === 0"
                    >
                      {{ fmt(c.ar_balance) }} owed
                    </span>
                    <a routerLink="/money/credit" class="btn btn-ghost btn-xs">Credit →</a>
                    <button class="btn btn-ghost btn-xs" (click)="startEdit(c)">Edit</button>
                  </div>

                  @if (expandedFor() === c.id) {
                    <div class="mt-3 border-t pt-3">
                      <h3 class="mb-1 text-sm font-semibold">Order history</h3>
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
                                <td class="text-right">{{ fmt(o.total) }}</td>
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
      </div>

      <app-mobile-fab ariaLabel="New customer" (fabClick)="startCreate()" />
    </main>
  `,
})
export class CustomersComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly customers = signal<CustomerWithAr[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly orders = signal<OrderWithCustomer[]>([]);

  protected readonly query = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CustomerWithAr | null>(null);

  protected readonly firstName = new FormControl('', { nonNullable: true });
  protected readonly lastName = new FormControl('', { nonNullable: true });
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });

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
    try {
      this.orders.set(await this.pos.customerOrders(customerId));
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

  protected name(c: MoneyCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
}
