import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { CustomerService, CreditCustomerSummary } from '../../../core/services/customer.service';

@Component({
  selector: 'app-credit',
  imports: [CommonModule],
  styleUrl: './credit.component.scss',
  template: `
    <div class="space-y-5 lg:space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl lg:text-3xl font-bold tracking-tight">Credit Management</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Approve customers for credit, adjust limits, and manage balances
          </p>
        </div>

        <div class="flex gap-2 shrink-0">
          <button
            (click)="reloadCustomers()"
            class="btn btn-ghost btn-square btn-sm lg:btn-md"
            [disabled]="isLoading()"
            title="Refresh credit data"
          >
            @if (!isLoading()) {
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            } @else {
              <span class="loading loading-spinner loading-sm"></span>
            }
          </button>
        </div>
      </div>

      @if (!hasPermission()) {
        <div role="alert" class="alert alert-warning">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>You need credit management permissions to access this page.</span>
        </div>
      } @else {
        <!-- Statistics Cards -->
        @if (stats(); as statsData) {
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <!-- Total Customers -->
            <div class="card bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20">
              <div class="card-body p-3 lg:p-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-base-content/60 truncate">Total Customers</p>
                    <p class="text-xl lg:text-2xl font-bold text-warning tracking-tight">{{ statsData.total }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Approved -->
            <div class="card bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
              <div class="card-body p-3 lg:p-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-base-content/60 truncate">Approved</p>
                    <p class="text-xl lg:text-2xl font-bold text-success tracking-tight">{{ statsData.approved }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Total Outstanding -->
            <div class="card bg-gradient-to-br from-error/10 to-error/5 border border-error/20">
              <div class="card-body p-3 lg:p-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-base-content/60 truncate">Outstanding</p>
                    <p class="text-lg lg:text-xl font-bold text-error tracking-tight">{{ currencyService.format(statsData.totalOutstanding * 100) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Total Limit -->
            <div class="card bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div class="card-body p-3 lg:p-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-base-content/60 truncate">Total Limit</p>
                    <p class="text-lg lg:text-xl font-bold text-primary tracking-tight">{{ currencyService.format(statsData.totalLimit * 100) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Search Bar -->
        <div class="form-control">
          <input
            type="text"
            class="input input-bordered w-full"
            placeholder="Search by customer name or phone..."
            [value]="searchTerm()"
            (input)="searchTerm.set($any($event.target).value)"
          />
        </div>

        <!-- Loading State -->
        @if (isLoading()) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <div class="flex flex-col items-center justify-center py-12">
                <span class="loading loading-spinner loading-lg text-warning"></span>
                <p class="text-sm text-base-content/60 mt-4">Loading credit data...</p>
              </div>
            </div>
          </div>
        }

        <!-- Empty State -->
        @else if (filteredCustomers().length === 0) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <div class="text-center py-12 lg:py-16 px-4">
                <div class="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 rounded-full bg-base-200 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 lg:h-10 lg:w-10 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <h3 class="text-lg font-semibold">No credit customers found</h3>
                <p class="text-sm text-base-content/60 mt-2 max-w-md mx-auto">
                  {{ searchTerm() ? 'Try adjusting your search terms.' : 'No customers with credit data available.' }}
                </p>
                @if (searchTerm()) {
                  <button (click)="searchTerm.set('')" class="btn btn-outline btn-sm mt-6">Clear Search</button>
                }
              </div>
            </div>
          </div>
        }

        <!-- Credit List -->
        @else {
          <!-- Mobile: Card View -->
          <div class="lg:hidden space-y-3">
            @for (customer of filteredCustomers(); track customer.id) {
              <div class="card bg-base-100 shadow-sm border border-base-300 rounded-xl">
                <div class="card-body p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-base truncate">{{ customer.name || 'Unnamed Customer' }}</h3>
                      <p class="text-xs text-base-content/60 truncate">{{ customer.phone || customer.email || '—' }}</p>
                    </div>
                    <span
                      class="badge badge-sm"
                      [class.badge-success]="customer.isCreditApproved"
                      [class.badge-warning]="!customer.isCreditApproved"
                    >
                      {{ customer.isCreditApproved ? 'Approved' : 'Pending' }}
                    </span>
                  </div>

                  <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-base-300">
                    <div>
                      <p class="text-xs text-base-content/60">Outstanding</p>
                      <p class="text-sm font-semibold text-error">{{ currencyService.format(customer.outstandingAmount * 100) }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-base-content/60">Limit</p>
                      <p class="text-sm font-semibold">{{ currencyService.format(customer.creditLimit * 100) }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-base-content/60">Available</p>
                      <p class="text-sm font-semibold text-success">{{ currencyService.format(customer.availableCredit * 100) }}</p>
                    </div>
                  </div>

                  <div class="flex gap-2 mt-3">
                    @if (customer.isCreditApproved) {
                      <button
                        class="btn btn-sm btn-outline flex-1"
                        (click)="revoke(customer)"
                        [disabled]="actionInProgress() === customer.id"
                      >
                        @if (actionInProgress() === customer.id) {
                          <span class="loading loading-spinner loading-xs"></span>
                        }
                        Revoke
                      </button>
                    } @else {
                      <button
                        class="btn btn-sm btn-primary flex-1"
                        (click)="approve(customer)"
                        [disabled]="actionInProgress() === customer.id"
                      >
                        @if (actionInProgress() === customer.id) {
                          <span class="loading loading-spinner loading-xs"></span>
                        }
                        Approve
                      </button>
                    }
                    <button
                      class="btn btn-sm btn-ghost"
                      (click)="navigateToEditLimit(customer)"
                      [disabled]="actionInProgress() === customer.id"
                    >
                      Edit Limit
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Desktop: Table View -->
          <div class="card bg-base-100 shadow hidden lg:block">
          <div class="overflow-x-auto">
              <table class="table table-zebra">
              <thead>
                  <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th class="text-right">Outstanding</th>
                  <th class="text-right">Limit</th>
                  <th class="text-right">Available</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                  @for (customer of filteredCustomers(); track customer.id) {
                    <tr>
                      <td>
                        <div class="font-semibold">{{ customer.name || 'Unnamed Customer' }}</div>
                        <div class="text-xs text-base-content/60">ID: {{ customer.id.slice(0, 8) }}...</div>
                      </td>
                      <td>
                        <div class="text-sm">{{ customer.phone || '—' }}</div>
                        <div class="text-xs text-base-content/60">{{ customer.email || '—' }}</div>
                      </td>
                      <td class="text-right">
                        <span class="text-error font-medium">{{ currencyService.format(customer.outstandingAmount * 100) }}</span>
                      </td>
                      <td class="text-right">
                        @if (isEditingLimit(customer.id)) {
                          <div class="flex flex-col items-end gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              class="input input-bordered input-sm w-28 text-right"
                              [value]="editLimitValue()"
                              (input)="editLimitValue.set($any($event.target).valueAsNumber ?? 0)"
                            />
                            <div class="flex gap-1">
                              <button class="btn btn-xs btn-primary" (click)="saveLimit(customer)" [disabled]="actionInProgress() === customer.id">Save</button>
                              <button class="btn btn-xs btn-ghost" (click)="stopEditingLimit()" [disabled]="actionInProgress() === customer.id">Cancel</button>
                            </div>
                          </div>
                        } @else {
                          <div class="flex items-center justify-end gap-2">
                            <span>{{ currencyService.format(customer.creditLimit * 100) }}</span>
                            <button class="btn btn-ghost btn-xs" (click)="startEditingLimit(customer)">Edit</button>
                          </div>
                        }
                      </td>
                      <td class="text-right">
                        <span class="text-success font-medium">{{ currencyService.format(customer.availableCredit * 100) }}</span>
                      </td>
                      <td>
                        @if (isEditingDuration(customer.id)) {
                          <div class="flex flex-col gap-2">
                            <input
                              type="number"
                              min="1"
                              class="input input-bordered input-sm w-20 text-right"
                              [value]="editDurationValue()"
                              (input)="editDurationValue.set($any($event.target).valueAsNumber ?? 1)"
                            />
                            <div class="flex gap-1">
                              <button class="btn btn-xs btn-primary" (click)="saveDuration(customer)" [disabled]="actionInProgress() === customer.id">Save</button>
                              <button class="btn btn-xs btn-ghost" (click)="stopEditingDuration()" [disabled]="actionInProgress() === customer.id">Cancel</button>
                            </div>
                          </div>
                        } @else {
                          <div class="flex items-center gap-2">
                            <span>{{ customer.creditDuration }} days</span>
                            <button class="btn btn-ghost btn-xs" (click)="startEditingDuration(customer)">Edit</button>
                          </div>
                        }
                      </td>
                      <td>
                        <span
                          class="badge badge-sm"
                          [class.badge-success]="customer.isCreditApproved"
                          [class.badge-warning]="!customer.isCreditApproved"
                        >
                          {{ customer.isCreditApproved ? 'Approved' : 'Pending' }}
                        </span>
                      </td>
                      <td>
                        <div class="flex justify-end gap-2">
                          @if (customer.isCreditApproved) {
                            <button
                              class="btn btn-xs btn-outline"
                              (click)="revoke(customer)"
                              [disabled]="actionInProgress() === customer.id"
                            >
                              @if (actionInProgress() === customer.id) {
                                <span class="loading loading-spinner loading-xs"></span>
                              }
                              Revoke
                            </button>
                          } @else {
                            <button
                              class="btn btn-xs btn-primary"
                              (click)="approve(customer)"
                              [disabled]="actionInProgress() === customer.id"
                            >
                              @if (actionInProgress() === customer.id) {
                                <span class="loading loading-spinner loading-xs"></span>
                              }
                              Approve
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditComponent implements OnInit {
  private readonly customerService = inject(CustomerService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly currencyService = inject(CurrencyService);

  readonly isLoading = signal(false);
  readonly actionInProgress = signal<string | null>(null);
  readonly customers = signal<CreditCustomerSummary[]>([]);
  readonly searchTerm = signal('');
  readonly editingLimitCustomerId = signal<string | null>(null);
  readonly editingDurationCustomerId = signal<string | null>(null);
  readonly editLimitValue = signal(0);
  readonly editDurationValue = signal(30);

  readonly hasPermission = this.authService.hasCreditManagementPermission;

  readonly filteredCustomers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.customers();
    }
    return this.customers().filter((customer) => {
      return (
        customer.name.toLowerCase().includes(term) ||
        (customer.phone ?? '').toLowerCase().includes(term) ||
        customer.id.toLowerCase().includes(term)
      );
    });
  });

  readonly stats = computed(() => {
    const allCustomers = this.customers();
    return {
      total: allCustomers.length,
      approved: allCustomers.filter((c) => c.isCreditApproved).length,
      totalOutstanding: allCustomers.reduce((sum, c) => sum + c.outstandingAmount, 0),
      totalLimit: allCustomers.reduce((sum, c) => sum + c.creditLimit, 0),
    };
  });

  ngOnInit(): void {
    if (this.hasPermission()) {
      void this.reloadCustomers();
    }
  }

  isEditingLimit(customerId: string): boolean {
    return this.editingLimitCustomerId() === customerId;
  }

  isEditingDuration(customerId: string): boolean {
    return this.editingDurationCustomerId() === customerId;
  }

  startEditingLimit(customer: CreditCustomerSummary): void {
    this.editingLimitCustomerId.set(customer.id);
    this.editLimitValue.set(customer.creditLimit);
    this.stopEditingDuration();
  }

  /**
   * Navigate to customer edit page with credit section expanded
   * Used on mobile for better UX
   */
  navigateToEditLimit(customer: CreditCustomerSummary): void {
    // Navigate to customer edit page with query param to auto-expand credit section
    this.router.navigate(['/dashboard/customers/edit', customer.id], {
      queryParams: { expandCredit: 'true' },
    });
  }

  stopEditingLimit(): void {
    this.editingLimitCustomerId.set(null);
  }

  startEditingDuration(customer: CreditCustomerSummary): void {
    this.editingDurationCustomerId.set(customer.id);
    this.editDurationValue.set(customer.creditDuration);
    this.stopEditingLimit();
  }

  stopEditingDuration(): void {
    this.editingDurationCustomerId.set(null);
  }

  async reloadCustomers(): Promise<void> {
    this.isLoading.set(true);
    try {
      const customers = await this.customerService.listCreditCustomers();
      this.customers.set(customers);
    } catch (error) {
      console.error('Failed to load credit customers', error);
    } finally {
      this.isLoading.set(false);
      this.actionInProgress.set(null);
    }
  }

  async approve(customer: CreditCustomerSummary): Promise<void> {
    this.actionInProgress.set(customer.id);
    try {
      const updated = await this.customerService.approveCustomerCredit(
        customer.id,
        true,
        Math.max(customer.creditLimit, 0),
        customer,
        customer.creditDuration,
      );
      this.updateCustomer(updated);
    } catch (error) {
      console.error('Failed to approve customer credit', error);
    } finally {
      this.actionInProgress.set(null);
    }
  }

  async revoke(customer: CreditCustomerSummary): Promise<void> {
    this.actionInProgress.set(customer.id);
    try {
      const updated = await this.customerService.approveCustomerCredit(
        customer.id,
        false,
        0,
        customer,
        customer.creditDuration,
      );
      this.updateCustomer(updated);
    } catch (error) {
      console.error('Failed to revoke customer credit', error);
    } finally {
      this.actionInProgress.set(null);
    }
  }

  async saveLimit(customer: CreditCustomerSummary): Promise<void> {
    const newLimit = Math.max(this.editLimitValue(), 0);
    this.actionInProgress.set(customer.id);
    try {
      const updated = await this.customerService.updateCustomerCreditLimit(
        customer.id,
        newLimit,
        customer,
        customer.creditDuration,
      );
      this.updateCustomer(updated);
      this.stopEditingLimit();
    } catch (error) {
      console.error('Failed to update credit limit', error);
    } finally {
      this.actionInProgress.set(null);
    }
  }

  async saveDuration(customer: CreditCustomerSummary): Promise<void> {
    const newDuration = Math.max(this.editDurationValue(), 1);
    this.actionInProgress.set(customer.id);
    try {
      const updated = await this.customerService.updateCreditDuration(
        customer.id,
        newDuration,
        customer,
      );
      this.updateCustomer(updated);
      this.stopEditingDuration();
    } catch (error) {
      console.error('Failed to update credit duration', error);
    } finally {
      this.actionInProgress.set(null);
    }
  }

  private updateCustomer(updated: CreditCustomerSummary): void {
    this.customers.update((items) =>
      items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
  }
}
