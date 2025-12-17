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
import { CompanyService } from '../../../../../core/services/company.service';
import {
  AuditLog,
  AuditLogOptions,
  SettingsService,
} from '../../../../../core/services/settings.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { PaginationComponent } from '../../../../components/shared/pagination.component';
import { AuditTrailFilterComponent } from '../audit-trail-filter/audit-trail-filter.component';
import { UserDetailsModalComponent } from '../user-details-modal/user-details-modal.component';

@Component({
  selector: 'app-audit-trail',
  imports: [
    CommonModule,
    PaginationComponent,
    AuditTrailFilterComponent,
    UserDetailsModalComponent,
  ],
  templateUrl: './audit-trail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditTrailComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly companyService = inject(CompanyService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly auditLogs = signal<AuditLog[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expandedLogs = signal<Set<string>>(new Set());
  readonly selectedUserId = signal<string | null>(null);
  readonly selectedUserSource = signal<'user_action' | 'system_event'>('system_event');

  readonly searchQuery = signal('');
  readonly eventTypeFilter = signal('');
  readonly entityTypeFilter = signal('');
  readonly sourceFilter = signal('');

  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(20);
  readonly pageOptions = [10, 20, 50, 100];

  readonly availableEventTypes = computed(() => {
    const eventTypes = new Set<string>();
    this.auditLogs().forEach((log) => {
      if (log.eventType) eventTypes.add(log.eventType);
    });
    return Array.from(eventTypes).sort();
  });

  readonly availableEntityTypes = computed(() => {
    const entityTypes = new Set<string>();
    this.auditLogs().forEach((log) => {
      if (log.entityType) entityTypes.add(log.entityType);
    });
    return Array.from(entityTypes).sort();
  });

  readonly filteredLogs = computed(() => {
    let filtered = this.auditLogs();
    const search = this.searchQuery().toLowerCase().trim();
    const eventType = this.eventTypeFilter();
    const entityType = this.entityTypeFilter();
    const source = this.sourceFilter();

    if (eventType) filtered = filtered.filter((l) => l.eventType === eventType);
    if (entityType) filtered = filtered.filter((l) => l.entityType === entityType);
    if (source) filtered = filtered.filter((l) => l.source === source);

    if (search) {
      filtered = filtered.filter((l) => {
        return (
          (l.eventType || '').toLowerCase().includes(search) ||
          (l.entityType || '').toLowerCase().includes(search) ||
          (l.userId || '').toLowerCase().includes(search)
        );
      });
    }
    return filtered;
  });

  readonly hasActiveFilters = computed(() => {
    return !!(
      this.searchQuery().trim() ||
      this.eventTypeFilter() ||
      this.entityTypeFilter() ||
      this.sourceFilter()
    );
  });

  readonly paginatedLogs = computed(() => {
    const logs = this.filteredLogs();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    return logs.slice((page - 1) * perPage, page * perPage);
  });

  readonly totalPages = computed(() => {
    return Math.ceil(this.filteredLogs().length / this.itemsPerPage()) || 1;
  });

  readonly totalItems = computed(() => this.filteredLogs().length);

  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredLogs().length);
  });

  constructor() {
    effect(() => {
      const channel = this.companyService.activeChannel();
      if (channel) this.loadAuditLogs();
    });

    effect(() => {
      this.searchQuery();
      this.eventTypeFilter();
      this.entityTypeFilter();
      this.sourceFilter();
      this.currentPage.set(1);
    });
  }

  loadAuditLogs(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const options: AuditLogOptions = { limit: 1000, skip: 0 };

    this.settingsService.getAuditLogs(options).subscribe({
      next: (logs) => {
        const sorted = [...logs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        this.auditLogs.set(sorted);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load audit logs:', err);
        this.error.set('Failed to load audit logs.');
        this.isLoading.set(false);
      },
    });
  }

  toggleExpanded(logId: string): void {
    const expanded = new Set(this.expandedLogs());
    if (expanded.has(logId)) {
      expanded.delete(logId);
    } else {
      expanded.add(logId);
    }
    this.expandedLogs.set(expanded);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number): void {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatRelativeTime(timestamp: string): string {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return new Date(timestamp).toLocaleDateString();
  }

  formatEventType(eventType: string): string {
    return eventType
      .split('.')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  getEventTypeBadgeClass(eventType: string): string {
    if (eventType.includes('created')) return 'badge-success';
    if (eventType.includes('updated')) return 'badge-info';
    if (eventType.includes('deleted')) return 'badge-error';
    if (eventType.includes('order')) return 'badge-primary';
    return 'badge-neutral';
  }

  truncateId(id: string | null): string {
    if (!id) return '';
    return id.length > 8 ? `${id.substring(0, 8)}…` : id;
  }

  formatData(data: Record<string, any>): string {
    return JSON.stringify(data, null, 2);
  }

  showUserDetails(userId: string, source: string): void {
    this.selectedUserId.set(userId);
    this.selectedUserSource.set(source as 'user_action' | 'system_event');
  }

  closeUserModal(): void {
    this.selectedUserId.set(null);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.eventTypeFilter.set('');
    this.entityTypeFilter.set('');
    this.sourceFilter.set('');
    this.currentPage.set(1);
  }

  navigateToEntity(entityType: string, entityId: string): void {
    const routes: Record<string, string> = {
      Order: `/dashboard/orders/${entityId}`,
      Payment: `/dashboard/payments/${entityId}`,
      Customer: `/dashboard/customers/edit/${entityId}`,
    };

    const route = routes[entityType];
    if (route) {
      this.router.navigate([route]);
    } else {
      this.toastService.show('Info', `${entityType} navigation coming soon`, 'info', 3000);
    }
  }
}
