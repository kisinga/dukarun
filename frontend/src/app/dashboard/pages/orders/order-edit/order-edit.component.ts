import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OrderService } from '../../../../core/services/order.service';
import { OrdersService } from '../../../../core/services/orders.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  ProductSearchService,
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { PageHeaderComponent } from '../../../components/shared/page-header.component';
import { ProductSearchViewComponent } from '../../shared/components/product-search-view.component';

@Component({
  selector: 'app-order-edit',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, ProductSearchViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-6 anim-stagger pb-20 lg:pb-6">
      <app-page-header
        title="Edit draft order"
        [subtitle]="order() ? 'Order ' + order()?.code : ''"
        [showRefresh]="false"
      >
        <a actions [routerLink]="['/dashboard/orders', orderId()]" class="btn btn-ghost btn-sm">
          Back to order
        </a>
      </app-page-header>

      @if (error()) {
        <div class="alert alert-error">
          <span>{{ error() }}</span>
          <button (click)="error.set(null)" class="btn btn-ghost btn-xs">Dismiss</button>
        </div>
      }

      @if (isLoading()) {
        <div class="flex justify-center py-12">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (order()) {
        <div class="card bg-base-100 shadow-sm border border-base-300/60">
          <div class="card-body p-4">
            <h3 class="font-bold text-base mb-3">Items</h3>
            <div class="overflow-x-auto">
              <table class="table table-zebra table-sm">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th class="text-right w-24">Qty</th>
                    <th class="text-right w-28">Unit price</th>
                    <th class="text-right w-28">Total</th>
                    <th class="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (line of order()!.lines; track line.id) {
                    <tr>
                      <td>{{ getLineName(line) }}</td>
                      <td class="text-right">
                        <input
                          type="number"
                          class="input input-bordered input-sm w-20 text-right"
                          [value]="line.quantity"
                          min="1"
                          (change)="onQuantityChange(line.id, $any($event.target).value)"
                        />
                      </td>
                      <td class="text-right">
                        <input
                          type="number"
                          class="input input-bordered input-sm w-24 text-right"
                          [value]="line.linePriceWithTax / line.quantity / 100"
                          min="0"
                          step="0.01"
                          (change)="onPriceChange(line, $any($event.target).value)"
                        />
                      </td>
                      <td class="text-right font-medium">
                        {{ currencyService.format(line.linePriceWithTax) }}
                      </td>
                      <td>
                        <button
                          class="btn btn-ghost btn-xs btn-circle text-error"
                          (click)="removeLine(line.id)"
                          [disabled]="isRemovingLine() === line.id"
                          aria-label="Remove line"
                        >
                          @if (isRemovingLine() === line.id) {
                            <span class="loading loading-spinner loading-xs"></span>
                          } @else {
                            ✕
                          }
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="mt-4 pt-4 border-t border-base-300">
              <p class="text-sm font-medium text-base-content/70 mb-2">Add product</p>
              <app-product-search-view
                [searchResults]="productSearchResults()"
                [isSearching]="isSearchingProducts()"
                [compact]="true"
                [variantsExpandedByDefault]="false"
                (searchTermChange)="onProductSearch($event)"
                (variantSelected)="onVariantSelected($event)"
              />
            </div>
            <div class="mt-4 flex justify-between items-center">
              <span class="font-bold">Order total</span>
              <span class="font-bold text-lg">{{
                currencyService.format(order()!.totalWithTax)
              }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ordersService = inject(OrdersService);
  private readonly orderService = inject(OrderService);
  private readonly productSearchService = inject(ProductSearchService);

  readonly currencyService = inject(CurrencyService);

  readonly orderId = signal<string | null>(null);
  readonly order = this.ordersService.currentOrder;
  readonly isLoading = this.ordersService.isLoading;
  readonly error = signal<string | null>(null);
  readonly isRemovingLine = signal<string | null>(null);

  readonly productSearchResults = signal<ProductSearchResult[]>([]);
  readonly isSearchingProducts = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.orderId.set(id);
      this.ordersService.fetchOrderById(id);
    }
  }

  getLineName(line: any): string {
    return line?.productVariant?.name ?? 'Unknown';
  }

  async onQuantityChange(orderLineId: string, value: string): Promise<void> {
    const qty = parseInt(value, 10);
    const id = this.orderId();
    if (!id || isNaN(qty) || qty < 1) return;

    this.error.set(null);
    try {
      await this.orderService.adjustDraftOrderLine(id, orderLineId, qty);
      await this.ordersService.fetchOrderById(id);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to update quantity');
    }
  }

  async onPriceChange(line: { id: string; quantity: number }, value: string): Promise<void> {
    const id = this.orderId();
    if (!id) return;

    const unitPrice = parseFloat(value);
    if (isNaN(unitPrice) || unitPrice < 0) return;

    const quantity = line.quantity || 1;
    const lineTotalCents = Math.round(unitPrice * 100 * quantity);
    this.error.set(null);
    try {
      await this.orderService.setOrderLineCustomPrice(line.id, lineTotalCents);
      await this.ordersService.fetchOrderById(id);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to update price');
    }
  }

  async removeLine(orderLineId: string): Promise<void> {
    const id = this.orderId();
    if (!id) return;

    this.isRemovingLine.set(orderLineId);
    this.error.set(null);
    try {
      await this.orderService.removeDraftOrderLine(id, orderLineId);
      await this.ordersService.fetchOrderById(id);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to remove line');
    } finally {
      this.isRemovingLine.set(null);
    }
  }

  async onProductSearch(term: string): Promise<void> {
    this.isSearchingProducts.set(true);
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.productSearchResults.set([]);
      this.isSearchingProducts.set(false);
      return;
    }
    try {
      const results = await this.productSearchService.searchProducts(trimmed);
      this.productSearchResults.set(results);
    } catch {
      this.productSearchResults.set([]);
    } finally {
      this.isSearchingProducts.set(false);
    }
  }

  async onVariantSelected(event: {
    product: ProductSearchResult;
    variant: ProductVariant;
  }): Promise<void> {
    const id = this.orderId();
    if (!id) return;

    this.error.set(null);
    try {
      await this.orderService.addItemToDraftOrder(id, {
        productVariantId: event.variant.id,
        quantity: 1,
      });
      await this.ordersService.fetchOrderById(id);
      this.productSearchResults.set([]);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to add item');
    }
  }
}
