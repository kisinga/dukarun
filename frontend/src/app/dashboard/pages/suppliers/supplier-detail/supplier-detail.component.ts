import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyService } from '../../../../core/services/currency.service';
import { SupplierService } from '../../../../core/services/supplier.service';
import { ApolloService } from '../../../../core/services/apollo.service';
import { GetPurchasesDocument, SortOrder } from '../../../../core/graphql/generated/graphql';

const RECENT_PURCHASES_TAKE = 15;

/**
 * Read-only supplier detail page.
 * Shows profile, details, and recent purchases with links.
 */
@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './supplier-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly supplierService = inject(SupplierService);
  private readonly apollo = inject(ApolloService);
  readonly currencyService = inject(CurrencyService);

  readonly supplier = signal<any | null>(null);
  readonly recentPurchases = signal<any[]>([]);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

  readonly supplierId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  readonly supplierName = computed(() => {
    const s = this.supplier();
    if (!s) return 'Supplier';
    return `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.emailAddress || 'Supplier';
  });

  ngOnInit(): void {
    const id = this.supplierId();
    if (id) {
      this.load(id);
    } else {
      this.isLoading.set(false);
      this.error.set('No supplier ID');
    }
  }

  private async load(supplierId: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const s = await this.supplierService.getSupplierById(supplierId);
      this.supplier.set(s);
      if (!s) {
        this.isLoading.set(false);
        return;
      }
      const purchases = await this.loadRecentPurchases(supplierId);
      this.recentPurchases.set(purchases);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load supplier');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadRecentPurchases(supplierId: string): Promise<any[]> {
    try {
      const client = this.apollo.getClient();
      const result = await client.query({
        query: GetPurchasesDocument,
        variables: {
          options: {
            filter: { supplierId },
            take: RECENT_PURCHASES_TAKE,
            skip: 0,
            sort: { createdAt: SortOrder.DESC },
          },
        },
        fetchPolicy: 'network-only',
      });
      return result.data?.purchases?.items ?? [];
    } catch {
      return [];
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents ?? 0, false);
  }

  getSupplierCode(): string {
    const s = this.supplier();
    return s?.customFields?.supplierCode ?? '—';
  }

  getSupplierType(): string {
    const s = this.supplier();
    return s?.customFields?.supplierType ?? 'General';
  }

  getContactPerson(): string | null {
    const s = this.supplier();
    return s?.customFields?.contactPerson ?? null;
  }

  getPaymentTerms(): string | null {
    const s = this.supplier();
    return s?.customFields?.paymentTerms ?? null;
  }

  getNotes(): string | null {
    const s = this.supplier();
    return s?.customFields?.notes ?? null;
  }

  formatAddress(addr: any): string {
    if (!addr) return '';
    const parts = [
      addr.streetLine1,
      addr.streetLine2,
      addr.city,
      addr.postalCode,
      addr.country?.name,
    ].filter(Boolean);
    return parts.join(', ');
  }
}
