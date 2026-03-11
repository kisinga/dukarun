import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CompanySearchSelectComponent } from '../../shared/components/company-search-select.component';
import { CustomerSearchService } from '../../../../core/services/customer/customer-search.service';
import { ProductSearchService } from '../../../../core/services/product/product-search.service';
import type { ProductSearchResult } from '../../../../core/services/product/product-search.service';
import { OrdersListFilterService } from '../services/orders-list-filter.service';

/** Customer item for search select: id + display name */
interface CustomerItem {
  id: string;
  name: string;
  subtitle?: string;
}

/**
 * Advanced filters modal for the orders list.
 * Composed sections: Date (single + range), Customer, Amount, Product, Order & status.
 * Only depends on OrdersListFilterService; Apply/Clear update the service and close.
 */
@Component({
  selector: 'app-orders-advanced-filters-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CompanySearchSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-advanced-filters-modal.component.html',
})
export class OrdersAdvancedFiltersModalComponent {
  readonly filterService = inject(OrdersListFilterService);
  private readonly customerSearch = inject(CustomerSearchService);
  private readonly productSearch = inject(ProductSearchService);

  isOpen = input<boolean>(false);
  closed = output<void>();

  dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  // Date: single or range
  readonly dateMode = signal<'single' | 'range'>('single');
  readonly localSingleDate = signal<string | null>(null);
  readonly localRangeFrom = signal<string | null>(null);
  readonly localRangeTo = signal<string | null>(null);

  // Customer (local until Apply)
  readonly localCustomerId = signal<string | null>(null);
  readonly localCustomerLabel = signal('');
  readonly customerSearchTerm = signal('');
  readonly customerResults = signal<CustomerItem[]>([]);
  readonly customerSearching = signal(false);
  private customerDebounce: ReturnType<typeof setTimeout> | null = null;

  // Amount
  readonly localAmountMin = signal<number | null>(null);
  readonly localAmountMax = signal<number | null>(null);

  // Product (local until Apply)
  readonly localProductVariantId = signal<string | null>(null);
  readonly localProductLabel = signal<string | null>(null);
  readonly productSearchTerm = signal('');
  readonly productResults = signal<ProductSearchResult[]>([]);
  readonly productSearching = signal(false);
  private productDebounce: ReturnType<typeof setTimeout> | null = null;

  // Order & status
  readonly localOrderCode = signal('');
  readonly localState = signal('');

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const d = this.dialog()?.nativeElement;
      if (!d) return;
      if (open) {
        this.seedFromFilterService();
        const onClose = () => {
          d.removeEventListener('close', onClose);
          this.closed.emit();
        };
        d.addEventListener('close', onClose);
        d.showModal();
      } else {
        d.close();
      }
    });
  }

  private seedFromFilterService(): void {
    const dateFrom = this.filterService.dateFrom();
    const dateTo = this.filterService.dateTo();
    if (dateFrom != null && dateTo != null && dateFrom === dateTo) {
      this.dateMode.set('single');
      this.localSingleDate.set(dateFrom);
      this.localRangeFrom.set(null);
      this.localRangeTo.set(null);
    } else if (dateFrom != null || dateTo != null) {
      this.dateMode.set('range');
      this.localSingleDate.set(null);
      this.localRangeFrom.set(dateFrom);
      this.localRangeTo.set(dateTo);
    } else {
      this.dateMode.set('single');
      this.localSingleDate.set(null);
      this.localRangeFrom.set(null);
      this.localRangeTo.set(null);
    }
    this.localOrderCode.set(this.filterService.orderCode());
    this.localAmountMin.set(this.filterService.amountMin());
    this.localAmountMax.set(this.filterService.amountMax());
    this.localState.set(this.filterService.stateFilter());
    this.localCustomerId.set(this.filterService.customerIdFilter());
    this.localCustomerLabel.set('');
    this.customerSearchTerm.set('');
    this.customerResults.set([]);
    this.localProductVariantId.set(this.filterService.productVariantId());
    this.localProductLabel.set(this.filterService.productVariantId() ? 'Selected' : null);
    this.productSearchTerm.set('');
    this.productResults.set([]);
  }

  onCustomerSearchTermChange(term: string): void {
    this.customerSearchTerm.set(term);
    if (this.customerDebounce) clearTimeout(this.customerDebounce);
    const t = term.trim();
    if (t.length < 2) {
      this.customerResults.set([]);
      return;
    }
    this.customerDebounce = setTimeout(async () => {
      this.customerSearching.set(true);
      try {
        const items = await this.customerSearch.searchCustomers(t, 20, {
          fetchPolicy: 'network-only',
        });
        this.customerResults.set(
          items.map((c: any) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || '—',
            subtitle: c.phoneNumber || c.emailAddress,
          })),
        );
      } finally {
        this.customerSearching.set(false);
      }
      this.customerDebounce = null;
    }, 300);
  }

  onCustomerSelect(customer: CustomerItem): void {
    this.localCustomerId.set(customer.id);
    this.localCustomerLabel.set(customer.name);
    this.customerSearchTerm.set(customer.name);
    this.customerResults.set([]);
  }

  clearCustomer(): void {
    this.localCustomerId.set(null);
    this.localCustomerLabel.set('');
    this.customerSearchTerm.set('');
    this.customerResults.set([]);
  }

  onProductSearchInput(value: string): void {
    this.productSearchTerm.set(value);
    if (this.productDebounce) clearTimeout(this.productDebounce);
    const t = value.trim();
    if (t.length < 2) {
      this.productResults.set([]);
      return;
    }
    this.productDebounce = setTimeout(async () => {
      this.productSearching.set(true);
      try {
        const results = await this.productSearch.searchProducts(t, {
          fetchPolicy: 'network-only',
        });
        this.productResults.set(results);
      } finally {
        this.productSearching.set(false);
      }
      this.productDebounce = null;
    }, 300);
  }

  onProductSelect(product: ProductSearchResult): void {
    const variantId = product.variants?.length > 0 ? product.variants[0].id : null;
    this.localProductVariantId.set(variantId);
    this.localProductLabel.set(product.name);
    this.productSearchTerm.set('');
    this.productResults.set([]);
  }

  clearProduct(): void {
    this.localProductVariantId.set(null);
    this.localProductLabel.set(null);
  }

  onApply(): void {
    const mode = this.dateMode();
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    if (mode === 'single') {
      const single = this.localSingleDate();
      if (single) {
        dateFrom = single;
        dateTo = single;
      }
    } else {
      dateFrom = this.localRangeFrom();
      dateTo = this.localRangeTo();
    }
    this.filterService.setFilters({
      dateFrom,
      dateTo,
      stateFilter: this.localState(),
      orderCode: this.localOrderCode().trim(),
      amountMin: this.localAmountMin(),
      amountMax: this.localAmountMax(),
      customerIdFilter: this.localCustomerId(),
      productVariantId: this.localProductVariantId(),
    });
    this.dialog()?.nativeElement?.close();
    this.closed.emit();
  }

  onClear(): void {
    this.filterService.clearFilters();
    this.dialog()?.nativeElement?.close();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).tagName === 'DIALOG') {
      this.dialog()?.nativeElement?.close();
      this.closed.emit();
    }
  }

  getCustomerLabel = (c: CustomerItem): string => c.name;
  getCustomerSubtitle = (c: CustomerItem): string => c.subtitle ?? '';
}
