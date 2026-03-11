import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { OrdersService } from '../../../../core/services/orders.service';
import { LinkPreviewDataProviderService } from '../../../../core/services/link-preview/link-preview-data-provider.service';

/**
 * Compact hover preview for order detail page.
 * Cache-first: uses OrderCacheService; on miss fetches via OrdersService (which hydrates cache).
 */
@Component({
  selector: 'app-order-detail-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="text-sm space-y-2 animate-pulse">
        <div class="skeleton h-4 w-2/3"></div>
        <div class="skeleton h-3 w-1/2"></div>
        <div class="skeleton h-3 w-full"></div>
      </div>
    } @else {
      <div class="text-sm space-y-1">
        <div class="font-semibold text-base-content flex items-center gap-2">
          <span class="font-mono">{{ code() }}</span>
          @if (state()) {
            <span class="badge badge-sm badge-ghost">{{ state() }}</span>
          }
        </div>
        @if (line2()) {
          <div class="text-base-content/70 text-xs">{{ line2() }}</div>
        }
        <div class="text-base-content/60 text-xs">{{ line3() }}</div>
      </div>
    }
  `,
})
export class OrderDetailPreviewComponent implements OnInit {
  readonly entityId = input.required<string>();
  readonly entityKey = input<string>();

  private readonly ordersService = inject(OrdersService);
  private readonly dataProvider = inject(LinkPreviewDataProviderService);

  readonly loading = signal(true);
  readonly code = signal<string>('—');
  readonly state = signal<string>('');
  readonly line2 = signal<string | null>(null);
  readonly line3 = signal<string>('…');

  ngOnInit(): void {
    this.load(this.entityId());
  }

  private async load(id: string): Promise<void> {
    const key = this.entityKey() ?? 'order';
    const cached = this.dataProvider.getCachedPreviewData(key, id);
    if (cached) {
      this.code.set(cached.data.line1);
      this.state.set(cached.data.badge ?? '');
      this.line2.set(cached.data.line2 ?? null);
      this.line3.set(cached.data.line3 ?? '—');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const order = await this.ordersService.fetchOrderById(id);
      if (!order) {
        this.code.set('Order');
        this.line3.set('Not found');
        this.loading.set(false);
        return;
      }
      const data = this.dataProvider.getCachedPreviewData(key, id);
      if (data) {
        this.code.set(data.data.line1);
        this.state.set(data.data.badge ?? '');
        this.line2.set(data.data.line2 ?? null);
        this.line3.set(data.data.line3 ?? '—');
      }
    } catch {
      this.code.set('Error');
      this.line3.set('Could not load');
    } finally {
      this.loading.set(false);
    }
  }
}
