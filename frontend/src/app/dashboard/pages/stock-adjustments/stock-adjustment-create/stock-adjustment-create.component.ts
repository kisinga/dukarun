import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ProductSearchService,
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { StockAdjustmentService } from '../../../../core/services/stock-adjustment.service';
import { StockAdjustmentLineItem } from '../../../../core/services/stock-adjustment.service.types';
import { StockLocationService } from '../../../../core/services/stock-location.service';
import { StockAdjustmentFormFieldsComponent } from '../components/stock-adjustment-form-fields.component';
import { StockAdjustmentLineItemFormComponent } from '../components/stock-adjustment-line-item-form.component';
import {
  StockAdjustmentLineItemDisplay,
  StockAdjustmentLineItemsTableComponent,
} from '../components/stock-adjustment-line-items-table.component';
import { PageHeaderComponent } from '../../../components/shared/page-header.component';
import { ProductSearchViewComponent } from '../../shared/components/product-search-view.component';

@Component({
  selector: 'app-stock-adjustment-create',
  imports: [
    CommonModule,
    PageHeaderComponent,
    ProductSearchViewComponent,
    StockAdjustmentFormFieldsComponent,
    StockAdjustmentLineItemFormComponent,
    StockAdjustmentLineItemsTableComponent,
  ],
  templateUrl: './stock-adjustment-create.component.html',
  styleUrl: './stock-adjustment-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAdjustmentCreateComponent implements OnInit {
  private readonly router = inject(Router);
  readonly stockAdjustmentService = inject(StockAdjustmentService);
  readonly productSearchService = inject(ProductSearchService);
  readonly stockLocationService = inject(StockLocationService);

  readonly adjustmentDraft = this.stockAdjustmentService.adjustmentDraft;
  readonly isLoading = this.stockAdjustmentService.isLoading;
  readonly error = this.stockAdjustmentService.error;
  readonly defaultLocation = this.stockLocationService.defaultLocation;

  readonly productSearchResults = signal<ProductSearchResult[]>([]);
  readonly isSearchingProducts = signal<boolean>(false);

  @ViewChild('addItemModal') addItemModalRef?: ElementRef<HTMLDialogElement>;

  readonly newLineItem = signal<{
    variantId?: string;
    variant?: ProductVariant;
    stockLocationId?: string;
    newStock?: number;
    currentStock?: number;
  }>({});

  readonly displayLineItems = computed<StockAdjustmentLineItemDisplay[]>(() => {
    const draft = this.adjustmentDraft();
    if (!draft?.lines) return [];
    return draft.lines.map((line) => {
      const currentStock = (line as any).currentStock ?? null;
      const newStock =
        currentStock !== null && line.quantityChange !== undefined
          ? currentStock + line.quantityChange
          : undefined;
      return {
        ...line,
        currentStock,
        newStock,
        variant: (line as any).variant,
      };
    });
  });

  ngOnInit(): void {
    this.stockAdjustmentService.initializeDraft();
    this.stockLocationService.fetchStockLocations();
  }

  async handleProductSearch(term: string): Promise<void> {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.productSearchResults.set([]);
      return;
    }
    this.isSearchingProducts.set(true);
    try {
      const results = await this.productSearchService.searchProducts(trimmed);
      this.productSearchResults.set(results);
    } catch {
      this.productSearchResults.set([]);
    } finally {
      this.isSearchingProducts.set(false);
    }
  }

  onProductSelectedFromSearch(product: ProductSearchResult): void {
    const variants = product.variants ?? [];
    if (variants.length === 1) {
      this.onVariantSelectedFromSearch({ product, variant: variants[0] });
    }
  }

  async onVariantSelectedFromSearch(event: {
    product: ProductSearchResult;
    variant: ProductVariant;
  }): Promise<void> {
    const variant = event.variant;
    const defaultLoc = this.defaultLocation();
    const locationId = defaultLoc?.id ?? '';
    try {
      let currentStock: number | null = null;
      if (locationId && variant.id) {
        currentStock = await this.stockAdjustmentService.getStockLevelForLocation(
          variant.id,
          locationId,
        );
      }
      this.newLineItem.set({
        variantId: variant.id,
        variant,
        stockLocationId: locationId,
        currentStock: currentStock ?? undefined,
        newStock: currentStock ?? undefined,
      });
    } catch {
      this.stockAdjustmentService.clearError();
      this.newLineItem.set({
        variantId: variant.id,
        variant,
        stockLocationId: locationId,
        currentStock: undefined,
        newStock: undefined,
      });
    }
    this.productSearchResults.set([]);
    this.openAddItemModal();
  }

  openAddItemModal(): void {
    setTimeout(() => this.addItemModalRef?.nativeElement?.showModal(), 0);
  }

  closeAddItemModal(): void {
    this.addItemModalRef?.nativeElement?.close();
    this.newLineItem.set({});
  }

  handleNewStockChange(newStock: number): void {
    this.newLineItem.update((c) => ({ ...c, newStock }));
  }

  handleAddLineItem(): void {
    const item = this.newLineItem();
    const locationId = this.defaultLocation()?.id ?? '';
    if (
      !item.variantId ||
      !locationId ||
      item.newStock === undefined ||
      item.currentStock === undefined
    ) {
      return;
    }
    const quantityChange = item.newStock - item.currentStock;
    const lineItem: StockAdjustmentLineItem & {
      currentStock?: number;
      newStock?: number;
      variant?: ProductVariant;
    } = {
      variantId: item.variantId,
      variant: item.variant,
      quantityChange,
      stockLocationId: locationId,
      currentStock: item.currentStock,
      newStock: item.newStock,
    };
    this.stockAdjustmentService.addAdjustmentItemLocal(lineItem as any);
    this.closeAddItemModal();
  }

  handleRemoveLineItem(index: number): void {
    this.stockAdjustmentService.removeAdjustmentItemLocal(index);
  }

  async handleUpdateLineItem(
    index: number,
    field: keyof StockAdjustmentLineItem,
    value: any,
  ): Promise<void> {
    const draft = this.adjustmentDraft();
    if (!draft?.lines[index]) return;
    const line = draft.lines[index] as any;

    if (field === 'quantityChange') {
      let currentStock = line.currentStock;
      if (currentStock === undefined || currentStock === null) {
        const locationId = this.defaultLocation()?.id;
        if (line.variantId && locationId) {
          currentStock =
            (await this.stockAdjustmentService.getStockLevelForLocation(
              line.variantId,
              locationId,
            )) ?? 0;
        } else {
          currentStock = 0;
        }
      }
      const newStock = currentStock + value;
      this.stockAdjustmentService.updateAdjustmentItemLocal(index, {
        quantityChange: value,
        currentStock: currentStock ?? undefined,
        newStock,
      } as any);
      return;
    }

    this.stockAdjustmentService.updateAdjustmentItemLocal(index, { [field]: value });
  }

  async handleSubmitAdjustment(): Promise<void> {
    try {
      await this.stockAdjustmentService.submitStockAdjustment();
      this.router.navigate(['/dashboard/stock-adjustments'], { queryParams: { recorded: '1' } });
    } catch {
      // Error shown via service error signal
    }
  }

  handleReasonChange(value: string): void {
    this.stockAdjustmentService.updateDraftField('reason', value);
  }

  handleNotesChange(value: string): void {
    this.stockAdjustmentService.updateDraftField('notes', value);
  }

  cancel(): void {
    this.router.navigate(['/dashboard/stock-adjustments']);
  }

  clearError(): void {
    this.stockAdjustmentService.clearError();
  }
}
