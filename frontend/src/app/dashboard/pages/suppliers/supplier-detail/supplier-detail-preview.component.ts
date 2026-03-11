import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { SupplierService } from '../../../../core/services/supplier.service';
import { SupplierSearchService } from '../../../../core/services/supplier/supplier-search.service';
import { ApolloService } from '../../../../core/services/apollo.service';
import { GetPurchasesDocument, SortOrder } from '../../../../core/graphql/generated/graphql';
import { LinkPreviewDataProviderService } from '../../../../core/services/link-preview/link-preview-data-provider.service';
import { LinkPreviewPayloadService } from '../../../../core/services/link-preview/link-preview-payload.service';

/**
 * Compact hover preview for supplier detail page.
 * Cache-first: uses SupplierSearchService; on miss fetches supplier + purchase count and hydrates cache.
 */
@Component({
  selector: 'app-supplier-detail-preview',
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
          <div class="text-base-content/70 text-xs truncate">{{ line2() }}</div>
        }
        <div class="text-base-content/60 text-xs">{{ line3() }}</div>
      </div>
    }
  `,
})
export class SupplierDetailPreviewComponent implements OnInit {
  readonly entityId = input.required<string>();
  readonly entityKey = input<string>();

  private readonly supplierService = inject(SupplierService);
  private readonly supplierSearchService = inject(SupplierSearchService);
  private readonly apollo = inject(ApolloService);
  private readonly dataProvider = inject(LinkPreviewDataProviderService);
  private readonly payloadService = inject(LinkPreviewPayloadService);

  readonly loading = signal(true);
  readonly name = signal<string>('Supplier');
  readonly line2 = signal<string | null>(null);
  readonly line3 = signal<string>('…');

  ngOnInit(): void {
    this.load(this.entityId());
  }

  private async load(id: string): Promise<void> {
    const key = this.entityKey() ?? 'supplier';
    const cached = this.dataProvider.getCachedPreviewData(key, id);
    if (cached) {
      this.name.set(cached.data.line1);
      this.line2.set(cached.data.line2 ?? null);
      this.line3.set(cached.data.line3 ?? '—');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const supplier = await this.supplierService.getSupplierById(id);
      if (!supplier) {
        this.name.set('Supplier');
        this.line3.set('Not found');
        this.loading.set(false);
        return;
      }
      this.supplierSearchService.hydrateSupplier(supplier);

      const client = this.apollo.getClient();
      const result = await client.query({
        query: GetPurchasesDocument,
        variables: {
          options: {
            filter: { supplierId: id },
            take: 1,
            skip: 0,
            sort: { createdAt: SortOrder.DESC },
          },
        },
        fetchPolicy: 'network-only',
      });
      const items = result.data?.purchases?.items ?? [];
      const total = result.data?.purchases?.totalItems ?? 0;
      const last = items[0];
      const lastRef = last?.referenceNumber || last?.id?.substring(0, 8) || '—';
      const data = this.payloadService.buildSupplierPayload(supplier, {
        total,
        lastRef,
      });
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
