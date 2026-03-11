import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { CustomerService } from '../../../../core/services/customer.service';
import { CustomerCreditService } from '../../../../core/services/customer/customer-credit.service';
import { CustomerSearchService } from '../../../../core/services/customer/customer-search.service';
import { LinkPreviewDataProviderService } from '../../../../core/services/link-preview/link-preview-data-provider.service';
import { LinkPreviewPayloadService } from '../../../../core/services/link-preview/link-preview-payload.service';

/**
 * Compact hover preview for customer detail page.
 * Cache-first: uses CustomerSearchService by-id cache; on miss fetches and hydrates.
 * When data is from cache and stale, transaction-related line (credit/outstanding) is greyed out.
 */
@Component({
  selector: 'app-customer-detail-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="text-sm space-y-2 animate-pulse">
        <div class="skeleton h-4 w-3/4"></div>
        <div class="skeleton h-3 w-1/2"></div>
        <div class="skeleton h-3 w-full"></div>
      </div>
    } @else {
      <div class="text-sm space-y-1">
        <div class="font-semibold text-base-content truncate">{{ name() }}</div>
        @if (line2()) {
          <div class="text-base-content/70 truncate">{{ line2() }}</div>
        }
        <div
          class="text-xs truncate"
          [class.text-base-content/60]="!stale()"
          [class.text-base-content/50]="stale()"
          [class.opacity-60]="stale()"
        >
          {{ line3() }}
        </div>
      </div>
    }
  `,
})
export class CustomerDetailPreviewComponent implements OnInit {
  readonly entityId = input.required<string>();
  readonly entityKey = input<string>();

  private readonly customerService = inject(CustomerService);
  private readonly creditService = inject(CustomerCreditService);
  private readonly customerSearchService = inject(CustomerSearchService);
  private readonly dataProvider = inject(LinkPreviewDataProviderService);
  private readonly payloadService = inject(LinkPreviewPayloadService);

  readonly loading = signal(true);
  readonly stale = signal(false);
  readonly name = signal<string>('Customer');
  readonly line2 = signal<string | null>(null);
  readonly line3 = signal<string>('…');

  ngOnInit(): void {
    this.load(this.entityId());
  }

  private async load(id: string): Promise<void> {
    const key = this.entityKey() ?? 'customer';
    const cached = this.dataProvider.getCachedPreviewData(key, id);
    if (cached) {
      this.name.set(cached.data.line1);
      this.line2.set(cached.data.line2 ?? null);
      this.line3.set(cached.data.line3 ?? '—');
      this.stale.set(cached.stale ?? false);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.stale.set(false);
    try {
      const c = await this.customerService.getCustomerById(id);
      if (!c) {
        this.name.set('Unknown');
        this.line3.set('Not found');
        this.loading.set(false);
        return;
      }
      const fullName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Customer';
      let creditSummary: any;
      try {
        creditSummary = await this.creditService.getCreditSummary(id, {
          name: fullName,
          email: c.emailAddress,
          phone: c.phoneNumber,
        });
      } catch {
        creditSummary = undefined;
      }
      this.customerSearchService.hydrateCustomer(c, creditSummary);
      const data = this.payloadService.buildCustomerPayload(c, creditSummary);
      this.name.set(data.line1);
      this.line2.set(data.line2 ?? null);
      this.line3.set(data.line3 ?? '—');
    } catch {
      this.name.set('Error');
      this.line3.set('Could not load');
    } finally {
      this.loading.set(false);
    }
  }
}
