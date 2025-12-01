import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CompanyService } from '../../../../core/services/company.service';
import {
  AuditLog,
  AuditLogOptions,
  SettingsService,
} from '../../../../core/services/settings.service';
import { ToastService } from '../../../../core/services/toast.service';
import { PaginationComponent } from '../../../components/shared/pagination.component';
import { AuditTrailFilterComponent } from './audit-trail-filter.component';
import { UserDetailsModalComponent } from './user-details-modal.component';

/**
 * Audit Trail Component
 *
 * Displays paginated audit logs in a mobile-optimized table format.
 * Shows event types, timestamps, entities, users, and expandable JSON data.
 */
@Component({
  selector: 'app-audit-trail',
  imports: [
    CommonModule,
    PaginationComponent,
    AuditTrailFilterComponent,
    UserDetailsModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="font-bold text-lg">📋 Audit Trail</h3>
            <p class="text-sm opacity-70">View all system events and user actions</p>
          </div>
          <button class="btn btn-ghost btn-sm" (click)="loadAuditLogs()" [disabled]="isLoading()">
            @if (isLoading()) {
              <span class="loading loading-spinner loading-xs"></span>
            } @else {
              🔄 Refresh
            }
          </button>
        </div>

        <!-- Loading State -->
        @if (isLoading() && auditLogs().length === 0) {
          <div class="flex justify-center items-center py-12">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        }

        <!-- Error State -->
        @if (error()) {
          <div class="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{{ error() }}</span>
          </div>
        }

        <!-- Filter Bar -->
        @if (!isLoading() || auditLogs().length > 0) {
          <div class="mb-4">
            <app-audit-trail-filter
              [(searchQuery)]="searchQuery"
              [(eventTypeFilter)]="eventTypeFilter"
              [(entityTypeFilter)]="entityTypeFilter"
              [(sourceFilter)]="sourceFilter"
              [eventTypes]="availableEventTypes()"
              [entityTypes]="availableEntityTypes()"
            />
          </div>
        }

        <!-- Empty State (No Filters) -->
        @if (!isLoading() && auditLogs().length === 0 && !error() && !hasActiveFilters()) {
          <div class="text-center py-12 text-base-content/60">
            <h4 class="font-semibold mb-2">No audit logs found</h4>
            <p class="text-sm opacity-70">No audit logs have been recorded yet</p>
          </div>
        }

        <!-- Empty State (With Filters) -->
        @if (
          !isLoading() &&
          filteredLogs().length === 0 &&
          auditLogs().length > 0 &&
          hasActiveFilters()
        ) {
          <div class="alert alert-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div class="flex-1">
              <span>No audit logs match your filters.</span>
              <button class="btn btn-sm btn-ghost ml-2" (click)="clearFilters()">
                Clear Filters
              </button>
            </div>
          </div>
        }

        <!-- Desktop Table View -->
        @if (!isLoading() || auditLogs().length > 0) {
          <div class="hidden md:block">
            <div class="overflow-x-auto">
              <table class="table table-zebra">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Source</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                @for (log of paginatedLogs(); track log.id) {
                  <tr>
                    <td>
                      <div class="text-xs">
                        <div class="font-medium">{{ formatTimestamp(log.timestamp) }}</div>
                        <div class="opacity-60">{{ formatRelativeTime(log.timestamp) }}</div>
                      </div>
                    </td>
                    <td>
                      <span class="badge badge-sm" [class]="getEventTypeBadgeClass(log.eventType)">
                        {{ formatEventType(log.eventType) }}
                      </span>
                    </td>
                    <td>
                      @if (log.entityType && log.entityId) {
                        <button
                          class="badge badge-sm badge-outline hover:badge-primary cursor-pointer transition-colors"
                          (click)="navigateToEntity(log.entityType!, log.entityId!)"
                          [title]="'View ' + log.entityType + ' ' + log.entityId"
                        >
                          <span class="font-medium">{{ log.entityType }}</span>
                          <span class="font-mono ml-1 opacity-70">{{
                            truncateId(log.entityId)
                          }}</span>
                        </button>
                      } @else {
                        <span class="opacity-40 text-xs">—</span>
                      }
                    </td>
                    <td>
                      @if (log.userId && log.userId !== 'null' && log.userId !== '') {
                        <button
                          class="badge badge-sm badge-info hover:badge-info/80 cursor-pointer transition-colors"
                          (click)="showUserDetails(log.userId!, log.source)"
                          [title]="'View user ' + log.userId"
                        >
                          <span class="font-mono">{{ truncateId(log.userId) }}</span>
                        </button>
                      } @else {
                        <span class="badge badge-sm badge-neutral opacity-60">System</span>
                      }
                    </td>
                    <td>
                      <span
                        class="badge badge-xs"
                        [class.badge-info]="log.source === 'user_action'"
                        [class.badge-neutral]="log.source === 'system_event'"
                      >
                        {{ log.source === 'user_action' ? 'User' : 'System' }}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-ghost btn-xs" (click)="toggleExpanded(log.id)">
                        @if (expandedLogs().has(log.id)) {
                          <span>▼</span>
                        } @else {
                          <span>▶</span>
                        }
                      </button>
                    </td>
                  </tr>
                  @if (expandedLogs().has(log.id)) {
                    <tr>
                      <td colspan="6" class="bg-base-200">
                        <div class="p-4">
                          <pre class="text-xs overflow-x-auto font-mono bg-base-300 p-3 rounded">{{
                            formatData(log.data)
                          }}</pre>
                        </div>
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr>
                    <td colspan="6" class="text-center py-8 text-base-content/60">
                      @if (hasActiveFilters()) {
                        No audit logs match your filters
                      } @else {
                        No audit logs found
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>

          <!-- Mobile Card View -->
          <div class="md:hidden space-y-3">
            @for (log of paginatedLogs(); track log.id) {
              <details class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-xl shadow-sm">
                <summary class="collapse-title p-4 min-h-0">
                  <div class="flex gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-start justify-between gap-2 mb-1">
                        <div class="flex items-center gap-2">
                          <span
                            class="badge badge-sm"
                            [class]="getEventTypeBadgeClass(log.eventType)"
                          >
                            {{ formatEventType(log.eventType) }}
                          </span>
                          <span
                            class="badge badge-xs"
                            [class.badge-info]="log.source === 'user_action'"
                            [class.badge-neutral]="log.source === 'system_event'"
                          >
                            {{ log.source === 'user_action' ? 'User' : 'System' }}
                          </span>
                        </div>
                      </div>
                      <div class="text-xs opacity-70">{{ formatTimestamp(log.timestamp) }}</div>
                      <div class="text-xs opacity-50">{{ formatRelativeTime(log.timestamp) }}</div>
                    </div>
                  </div>
                </summary>
                <div class="collapse-content px-4 pb-4 pt-0">
                  <div class="divider my-2"></div>
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <span
                          class="badge badge-sm"
                          [class]="getEventTypeBadgeClass(log.eventType)"
                        >
                          {{ formatEventType(log.eventType) }}
                        </span>
                        <span
                          class="badge badge-xs"
                          [class.badge-info]="log.source === 'user_action'"
                          [class.badge-neutral]="log.source === 'system_event'"
                        >
                          {{ log.source === 'user_action' ? 'User' : 'System' }}
                        </span>
                      </div>
                      <div class="text-xs opacity-70">{{ formatTimestamp(log.timestamp) }}</div>
                      <div class="text-xs opacity-50">{{ formatRelativeTime(log.timestamp) }}</div>
                    </div>
                    <button class="btn btn-ghost btn-xs" (click)="toggleExpanded(log.id)">
                      @if (expandedLogs().has(log.id)) {
                        <span>▼</span>
                      } @else {
                        <span>▶</span>
                      }
                    </button>
                  </div>

                  @if (log.entityType && log.entityId) {
                    <div class="mb-3">
                      <div class="text-xs text-base-content/60 mb-1">Entity</div>
                      <button
                        class="badge badge-sm badge-outline hover:badge-primary cursor-pointer transition-colors"
                        (click)="navigateToEntity(log.entityType!, log.entityId!)"
                        [title]="'View ' + log.entityType + ' ' + log.entityId"
                      >
                        <span class="font-medium">{{ log.entityType }}</span>
                        <span class="font-mono ml-1 opacity-70">{{
                          truncateId(log.entityId)
                        }}</span>
                      </button>
                    </div>
                  }

                  @if (log.userId && log.userId !== 'null' && log.userId !== '') {
                    <div class="mb-3">
                      <div class="text-xs text-base-content/60 mb-1">User</div>
                      <button
                        class="badge badge-sm badge-info hover:badge-info/80 cursor-pointer transition-colors"
                        (click)="showUserDetails(log.userId!, log.source)"
                        [title]="'View user ' + log.userId"
                      >
                        <span class="font-mono">{{ truncateId(log.userId) }}</span>
                      </button>
                    </div>
                  } @else {
                    <div class="mb-3">
                      <div class="text-xs text-base-content/60 mb-1">Source</div>
                      <span class="badge badge-sm badge-neutral opacity-60">System Event</span>
                    </div>
                  }

                  <div class="mt-3 pt-3 border-t border-base-300">
                    <div class="text-xs text-base-content/60 mb-2">Details</div>
                    <pre class="text-xs overflow-x-auto font-mono bg-base-200 p-3 rounded">{{
                      formatData(log.data)
                    }}</pre>
                  </div>
                </div>
              </details>
            } @empty {
              <div class="text-center py-8 text-base-content/60">
                @if (hasActiveFilters()) {
                  No audit logs match your filters
                } @else {
                  No audit logs found
                }
              </div>
            }
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1 && filteredLogs().length > 0) {
            <div class="mt-4">
              <div class="text-xs text-base-content/60 mb-2">
                Showing {{ (currentPage() - 1) * itemsPerPage() + 1 }} to
                {{ endItem() }} of {{ totalItems() }}
                audit logs
                @if (hasActiveFilters()) {
                  <span class="opacity-70">(filtered from {{ auditLogs().length }} total)</span>
                }
              </div>
              <app-pagination
                [currentPage]="currentPage()"
                [totalPages]="totalPages()"
                [itemsPerPage]="itemsPerPage()"
                [pageOptions]="pageOptions"
                [totalItems]="totalItems()"
                [showItemsPerPage]="true"
                itemLabel="audit logs"
                (pageChange)="onPageChange($event)"
                (itemsPerPageChange)="onItemsPerPageChange($event)"
              />
            </div>
          }
        }
      </div>
    </div>

    <!-- User Details Modal -->
    <app-user-details-modal
      [userId]="selectedUserId()"
      [source]="selectedUserSource()"
      (closed)="closeUserModal()"
    />
  `,
})
export class AuditTrailComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  // State
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expandedLogs = signal<Set<string>>(new Set());
  readonly selectedUserId = signal<string | null>(null);
  readonly selectedUserSource = signal<'user_action' | 'system_event'>('system_event');

  // Filter state
  readonly searchQuery = signal('');
  readonly eventTypeFilter = signal('');
  readonly entityTypeFilter = signal('');
  readonly sourceFilter = signal('');

  // Pagination state
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(20);
  readonly pageOptions = [10, 20, 50, 100];

  // Computed: Extract unique event types and entity types for filter dropdowns
  readonly availableEventTypes = computed(() => {
    const logs = this.auditLogs();
    const eventTypes = new Set<string>();
    logs.forEach((log) => {
      if (log.eventType) {
        eventTypes.add(log.eventType);
      }
    });
    return Array.from(eventTypes).sort();
  });

  readonly availableEntityTypes = computed(() => {
    const logs = this.auditLogs();
    const entityTypes = new Set<string>();
    logs.forEach((log) => {
      if (log.entityType) {
        entityTypes.add(log.entityType);
      }
    });
    return Array.from(entityTypes).sort();
  });

  // Computed: Filtered logs
  readonly filteredLogs = computed(() => {
    const logs = this.auditLogs();
    const searchQuery = this.searchQuery().toLowerCase().trim();
    const eventTypeFilter = this.eventTypeFilter();
    const entityTypeFilter = this.entityTypeFilter();
    const sourceFilter = this.sourceFilter();

    let filtered = logs;

    // Apply event type filter
    if (eventTypeFilter) {
      filtered = filtered.filter((log) => log.eventType === eventTypeFilter);
    }

    // Apply entity type filter
    if (entityTypeFilter) {
      filtered = filtered.filter((log) => log.entityType === entityTypeFilter);
    }

    // Apply source filter
    if (sourceFilter) {
      filtered = filtered.filter((log) => log.source === sourceFilter);
    }

    // Apply search query (searches across eventType, entityType, userId)
    if (searchQuery) {
      filtered = filtered.filter((log) => {
        // Search in event type
        const eventType = (log.eventType || '').toLowerCase();
        if (eventType.includes(searchQuery)) return true;

        // Search in entity type
        const entityType = (log.entityType || '').toLowerCase();
        if (entityType.includes(searchQuery)) return true;

        // Search in user ID
        const userId = (log.userId || '').toLowerCase();
        if (userId.includes(searchQuery)) return true;

        return false;
      });
    }

    return filtered;
  });

  // Computed: Check if any filters are active
  readonly hasActiveFilters = computed(() => {
    return !!(
      this.searchQuery().trim() ||
      this.eventTypeFilter() ||
      this.entityTypeFilter() ||
      this.sourceFilter()
    );
  });

  // Computed: Paginated logs from filtered logs
  readonly paginatedLogs = computed(() => {
    const logs = this.filteredLogs();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return logs.slice(start, end);
  });

  readonly totalPages = computed(() => {
    const logs = this.filteredLogs();
    const perPage = this.itemsPerPage();
    return Math.ceil(logs.length / perPage) || 1;
  });

  readonly totalItems = computed(() => this.filteredLogs().length);

  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredLogs().length);
  });

  constructor() {
    // Auto-load when channel changes
    effect(() => {
      const channel = this.companyService.activeChannel();
      if (channel) {
        this.loadAuditLogs();
      }
    });

    // Reset to page 1 when filters change
    effect(() => {
      // Watch filter signals
      this.searchQuery();
      this.eventTypeFilter();
      this.entityTypeFilter();
      this.sourceFilter();
      // Reset to first page when filters change
      this.currentPage.set(1);
    });
  }

  /**
   * Load audit logs from the API
   */
  loadAuditLogs(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const options: AuditLogOptions = {
      limit: 1000, // Fetch a large batch for client-side pagination
      skip: 0,
    };

    this.settingsService.getAuditLogs(options).subscribe({
      next: (logs) => {
        // Sort by timestamp descending (newest first)
        const sorted = [...logs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        this.auditLogs.set(sorted);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load audit logs:', err);
        this.error.set('Failed to load audit logs. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Toggle expanded state for a log entry
   */
  toggleExpanded(logId: string): void {
    const expanded = new Set(this.expandedLogs());
    if (expanded.has(logId)) {
      expanded.delete(logId);
    } else {
      expanded.add(logId);
    }
    this.expandedLogs.set(expanded);
  }

  /**
   * Handle page change
   */
  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  /**
   * Handle items per page change
   */
  onItemsPerPageChange(items: number): void {
    this.itemsPerPage.set(items);
    this.currentPage.set(1); // Reset to first page
  }

  /**
   * Format timestamp to readable date/time
   */
  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Format relative time (e.g., "2 hours ago")
   */
  formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Format event type for display
   */
  formatEventType(eventType: string): string {
    // Convert "order.created" to "Order Created"
    return eventType
      .split('.')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get badge class for event type
   */
  getEventTypeBadgeClass(eventType: string): string {
    if (eventType.includes('created')) return 'badge-success';
    if (eventType.includes('updated')) return 'badge-info';
    if (eventType.includes('deleted')) return 'badge-error';
    if (eventType.includes('order')) return 'badge-primary';
    return 'badge-neutral';
  }

  /**
   * Truncate ID for display
   */
  truncateId(id: string | null): string {
    if (!id) return '';
    return id.length > 8 ? `${id.substring(0, 8)}...` : id;
  }

  /**
   * Format JSON data for display
   */
  formatData(data: Record<string, any>): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Show user details modal
   */
  showUserDetails(userId: string, source: string): void {
    this.selectedUserId.set(userId);
    this.selectedUserSource.set(source as 'user_action' | 'system_event');
    // Modal will open automatically via effect in UserDetailsModalComponent
  }

  /**
   * Close user details modal
   */
  closeUserModal(): void {
    this.selectedUserId.set(null);
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchQuery.set('');
    this.eventTypeFilter.set('');
    this.entityTypeFilter.set('');
    this.sourceFilter.set('');
    this.currentPage.set(1);
  }

  /**
   * Navigate to entity (Order, Payment, etc.)
   * Uses router navigation to avoid nested modals
   */
  navigateToEntity(entityType: string, entityId: string): void {
    const navigationMap: Record<string, () => void> = {
      Order: () => {
        // Navigate to order detail page
        this.router.navigate(['/dashboard/orders', entityId]);
      },
      Payment: () => {
        // Navigate to payment detail page
        this.router.navigate(['/dashboard/payments', entityId]);
      },
      Customer: () => {
        // Navigate to customer detail page
        this.router.navigate(['/dashboard/customers/edit', entityId]);
      },
    };

    const handler = navigationMap[entityType];
    if (handler) {
      handler();
    } else {
      this.toastService.show(
        'Entity Details',
        `${entityType} navigation coming soon. ID: ${entityId}`,
        'info',
        3000,
      );
    }
  }
}
