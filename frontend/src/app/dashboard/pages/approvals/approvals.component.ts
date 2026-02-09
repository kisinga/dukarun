import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApprovalRequest, ApprovalService } from '../../../core/services/approval.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PageHeaderComponent } from '../shared/components/page-header.component';

@Component({
  selector: 'app-approvals',
  imports: [CommonModule, PageHeaderComponent],
  template: `
    <div class="min-h-screen bg-base-100">
      <app-page-header title="Approvals" (backClick)="goBack()" />

      <div class="p-4 max-w-2xl mx-auto">
        <!-- Tabs -->
        <div class="tabs tabs-boxed mb-4">
          <button
            class="tab"
            [class.tab-active]="activeTab() === 'pending'"
            (click)="setTab('pending')"
          >
            Pending
            @if (pendingCount() > 0) {
              <span class="badge badge-sm badge-primary ml-1">{{ pendingCount() }}</span>
            }
          </button>
          <button class="tab" [class.tab-active]="activeTab() === 'all'" (click)="setTab('all')">
            All
          </button>
          <button class="tab" [class.tab-active]="activeTab() === 'mine'" (click)="setTab('mine')">
            My Requests
          </button>
        </div>

        <!-- Loading -->
        @if (isLoading()) {
          <div class="flex justify-center py-12">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="alert alert-error text-sm mb-4">
            <span>{{ error() }}</span>
            <button (click)="error.set(null)" class="btn btn-ghost btn-xs">Dismiss</button>
          </div>
        }

        <!-- Empty state -->
        @if (!isLoading() && approvals().length === 0) {
          <div class="text-center py-12 text-base-content/50">
            <p class="text-4xl mb-2">
              @if (activeTab() === 'pending') {
                &#x2714;
              } @else {
                &#x1F4CB;
              }
            </p>
            <p>
              @if (activeTab() === 'pending') {
                No pending approvals
              } @else if (activeTab() === 'mine') {
                You haven't made any approval requests
              } @else {
                No approval requests found
              }
            </p>
          </div>
        }

        <!-- Approval cards -->
        <div class="space-y-3">
          @for (approval of approvals(); track approval.id) {
            <div class="card bg-base-200 shadow-sm">
              <div class="card-body p-4">
                <!-- Header row -->
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-sm" [class]="getTypeBadgeClass(approval.type)">
                      {{ getTypeLabel(approval.type) }}
                    </span>
                    <span class="badge badge-sm" [class]="getStatusBadgeClass(approval.status)">
                      {{ approval.status }}
                    </span>
                  </div>
                  <span class="text-xs text-base-content/50">
                    {{ formatTime(approval.createdAt) }}
                  </span>
                </div>

                <!-- Metadata summary -->
                <div class="text-sm mt-2">
                  @if (approval.type === 'overdraft' && approval.metadata) {
                    <p>
                      Account:
                      <span class="font-medium">{{
                        approval.metadata['accountCode'] || 'Cash'
                      }}</span>
                    </p>
                    <p>
                      Required:
                      <span class="font-medium">{{
                        formatCurrency(approval.metadata['requiredAmount'])
                      }}</span>
                      &middot; Available:
                      <span class="font-medium">{{
                        formatCurrency(approval.metadata['availableBalance'])
                      }}</span>
                    </p>
                  } @else {
                    <p class="text-base-content/70">{{ getTypeSummary(approval) }}</p>
                  }
                </div>

                <!-- Reviewer message -->
                @if (approval.message) {
                  <div class="mt-2 p-2 bg-base-300 rounded text-sm italic">
                    "{{ approval.message }}"
                  </div>
                }

                <!-- Actions (only for pending + reviewer tab) -->
                @if (approval.status === 'pending' && activeTab() !== 'mine') {
                  <!-- Inline message input -->
                  @if (reviewingId() === approval.id) {
                    <div class="mt-3 space-y-2">
                      <textarea
                        class="textarea textarea-bordered textarea-sm w-full"
                        rows="2"
                        placeholder="Add a message (optional)"
                        [value]="reviewMessage()"
                        (input)="reviewMessage.set($any($event.target).value)"
                      ></textarea>
                      <div class="flex gap-2">
                        <button
                          class="btn btn-success btn-sm flex-1"
                          [disabled]="isReviewing()"
                          (click)="submitReview(approval.id, 'approved')"
                        >
                          @if (isReviewing()) {
                            <span class="loading loading-spinner loading-xs"></span>
                          }
                          Approve
                        </button>
                        <button
                          class="btn btn-error btn-sm flex-1"
                          [disabled]="isReviewing()"
                          (click)="submitReview(approval.id, 'rejected')"
                        >
                          @if (isReviewing()) {
                            <span class="loading loading-spinner loading-xs"></span>
                          }
                          Reject
                        </button>
                        <button class="btn btn-ghost btn-sm" (click)="cancelReview()">
                          Cancel
                        </button>
                      </div>
                    </div>
                  } @else {
                    <div class="flex gap-2 mt-3">
                      <button
                        class="btn btn-success btn-sm flex-1"
                        (click)="startReview(approval.id)"
                      >
                        Approve
                      </button>
                      <button
                        class="btn btn-error btn-sm flex-1"
                        (click)="startReview(approval.id)"
                      >
                        Reject
                      </button>
                    </div>
                  }
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalsComponent implements OnInit {
  private readonly approvalService = inject(ApprovalService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly activeTab = signal<'pending' | 'all' | 'mine'>('pending');
  readonly approvals = signal<ApprovalRequest[]>([]);
  readonly pendingCount = signal(0);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Review state
  readonly reviewingId = signal<string | null>(null);
  readonly reviewMessage = signal('');
  readonly isReviewing = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadApprovals();
    // Also load pending count
    try {
      const pending = await this.approvalService.getApprovalRequests({ status: 'pending' });
      this.pendingCount.set(pending.totalItems);
    } catch {
      // Ignore
    }
  }

  async setTab(tab: 'pending' | 'all' | 'mine'): Promise<void> {
    this.activeTab.set(tab);
    this.cancelReview();
    await this.loadApprovals();
  }

  async loadApprovals(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const tab = this.activeTab();
      let result;

      if (tab === 'mine') {
        result = await this.approvalService.getMyApprovalRequests();
      } else if (tab === 'pending') {
        result = await this.approvalService.getApprovalRequests({ status: 'pending' });
      } else {
        result = await this.approvalService.getApprovalRequests();
      }

      this.approvals.set(result.items);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load approvals');
    } finally {
      this.isLoading.set(false);
    }
  }

  startReview(id: string): void {
    this.reviewingId.set(id);
    this.reviewMessage.set('');
  }

  cancelReview(): void {
    this.reviewingId.set(null);
    this.reviewMessage.set('');
  }

  async submitReview(id: string, action: 'approved' | 'rejected'): Promise<void> {
    this.isReviewing.set(true);
    this.error.set(null);
    try {
      await this.approvalService.reviewApprovalRequest({
        id,
        action,
        message: this.reviewMessage().trim() || undefined,
      });
      this.cancelReview();
      await this.loadApprovals();
      // Refresh notification count
      this.notificationService.loadUnreadCount();
      // Update pending count
      const pending = await this.approvalService.getApprovalRequests({ status: 'pending' });
      this.pendingCount.set(pending.totalItems);
    } catch (err: any) {
      this.error.set(err.message || `Failed to ${action} request`);
    } finally {
      this.isReviewing.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      overdraft: 'Overdraft',
      customer_credit: 'Customer Credit',
      below_wholesale: 'Below Wholesale',
      order_reversal: 'Order Reversal',
    };
    return labels[type] || type;
  }

  getTypeBadgeClass(type: string): string {
    const classes: Record<string, string> = {
      overdraft: 'badge-warning',
      customer_credit: 'badge-info',
      below_wholesale: 'badge-error',
      order_reversal: 'badge-neutral',
    };
    return classes[type] || 'badge-ghost';
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'badge-outline';
      case 'approved':
        return 'badge-success';
      case 'rejected':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  }

  getTypeSummary(approval: ApprovalRequest): string {
    if (approval.entityType && approval.entityId) {
      return `${approval.entityType} #${approval.entityId}`;
    }
    return `${this.getTypeLabel(approval.type)} request`;
  }

  formatCurrency(amountCents: number): string {
    if (!amountCents && amountCents !== 0) return '-';
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amountCents / 100);
  }

  formatTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return `${Math.floor(diffMin / 1440)}d ago`;
  }
}
