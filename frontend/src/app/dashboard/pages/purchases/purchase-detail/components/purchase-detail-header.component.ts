import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Purchase Detail Header Component
 *
 * Displays reference number, payment status badge, and purchase date
 */
@Component({
  selector: 'app-purchase-detail-header',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-base-300/50"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
          <h2 class="text-xl sm:text-2xl font-bold text-base-content">
            @if (referenceNumber()) {
              Purchase {{ referenceNumber() }}
            } @else {
              Purchase Details
            }
          </h2>
          <span class="badge badge-sm" [ngClass]="getPaymentStatusBadgeClass()">
            {{ paymentStatus() }}
          </span>
          @if (isCreditPurchase()) {
            <span class="badge badge-xs badge-info">Credit</span>
          }
        </div>
        <p class="text-xs sm:text-sm text-base-content/60">Date: {{ formattedDate() }}</p>
      </div>
    </div>
  `,
})
export class PurchaseDetailHeaderComponent {
  readonly referenceNumber = input<string | null>(null);
  readonly paymentStatus = input.required<string>();
  readonly purchaseDate = input<string | null | undefined>(null);
  readonly isCreditPurchase = input<boolean>(false);

  readonly formattedDate = computed(() => {
    const date = this.purchaseDate();
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  getPaymentStatusBadgeClass(): string {
    const status = this.paymentStatus().toLowerCase();
    if (status === 'paid') return 'badge-success';
    if (status === 'partial') return 'badge-warning';
    return 'badge-error';
  }
}
