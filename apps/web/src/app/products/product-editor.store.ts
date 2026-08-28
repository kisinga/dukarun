import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import type { TaxCategory } from '@dukarun/tax-types';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKesInput, parseKes } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { TaxService } from '../core/tax.service';
import {
  type CatalogVariantInput,
  PosService,
  type Product,
  type ProductVariant,
} from '../pos/pos.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { BARCODE_MAX_LENGTH, generateDukarunBarcode } from './barcode-labels';
import type { PendingProductImage } from './product-photo-control.component';
import type {
  ProductEditorRequest,
  ProductEditorResult,
  ProductEditorRow,
  ProductEditorRowMutation,
  ProductEditorStockInfo,
} from './product-editor.types';
import { LEARNING_EVENT_NAMES } from '../learning/learning-content';
import { LearningPlatformService } from '../learning/learning-platform.service';

/**
 * Component-scoped owner for the coupled product aggregate.
 *
 * The aggregate RPC commits product, variants, manufacturer, and image metadata together.
 * Storage remains external to that transaction, so uploads happen first and every unattached or
 * superseded object is durably queued for deletion.
 */
@Injectable()
export class ProductEditorStore implements OnDestroy {
  private readonly pos = inject(PosService);
  private readonly tax = inject(TaxService);
  private readonly supabase = inject(SupabaseService);
  private readonly catalog = inject(CatalogCacheService);
  private readonly locations = inject(LocationContextService);
  private readonly learning = inject(LearningPlatformService);
  readonly preferences = inject(CompanyPreferencesService);
  readonly permissions = inject(PermissionsService);
  readonly connectivity = inject(ConnectivityService);

  readonly name = new FormControl('', { nonNullable: true });
  readonly manufacturer = new FormControl('', { nonNullable: true });
  readonly barcode = new FormControl('', { nonNullable: true });
  readonly active = new FormControl(true, { nonNullable: true });
  readonly taxCategory = new FormControl('', { nonNullable: true });
  private readonly barcodeValue = toSignal(this.barcode.valueChanges, { initialValue: '' });
  private readonly activeValue = toSignal(this.active.valueChanges, { initialValue: true });

  private readonly requestState = signal<ProductEditorRequest | null>(null);
  readonly request = this.requestState.asReadonly();
  readonly mode = computed(() => this.request()?.mode ?? null);
  readonly product = computed<Product | null>(() => {
    const request = this.request();
    return request?.mode === 'edit' ? request.product : null;
  });
  private readonly stepState = signal<1 | 2>(1);
  readonly step = this.stepState.asReadonly();
  private readonly rowsState = signal<ProductEditorRow[]>([]);
  readonly rows = this.rowsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
  private readonly taxCategoriesState = signal<TaxCategory[]>([]);
  readonly taxCategories = this.taxCategoriesState.asReadonly();
  private readonly familyCategoriesState = signal<Set<string>>(new Set());
  readonly familyCategories = this.familyCategoriesState.asReadonly();
  private readonly categoryQueryState = signal('');
  readonly categoryQuery = this.categoryQueryState.asReadonly();
  private readonly pendingBarcodeState = signal<string | null>(null);
  readonly pendingBarcode = this.pendingBarcodeState.asReadonly();
  private readonly scannerTargetState = signal<'family' | number | null>(null);
  readonly scannerTarget = this.scannerTargetState.asReadonly();
  private readonly pendingImageState = signal<PendingProductImage | null>(null);
  readonly pendingImage = this.pendingImageState.asReadonly();
  private readonly imagePathState = signal<string | null>(null);
  readonly imagePath = this.imagePathState.asReadonly();
  private readonly imageRemovalPendingState = signal(false);
  readonly imageRemovalPending = this.imageRemovalPendingState.asReadonly();
  private readonly brokenImageState = signal(false);
  private readonly rowsDirtyState = signal(false);
  private readonly categoriesDirtyState = signal(false);
  private readonly validationTargetState = signal<'details' | 'variants' | null>(null);
  readonly validationTarget = this.validationTargetState.asReadonly();

  readonly manufacturers = this.catalog.manufacturers;
  readonly categories = this.catalog.categories;
  readonly categoryMembershipsComplete = this.catalog.categoryMembershipsComplete;
  readonly stockLocations = this.locations.locations;
  readonly barcodeMaxLength = BARCODE_MAX_LENGTH;
  readonly matchingCategories = computed(() => {
    const query = this.categoryQuery().trim().toLocaleLowerCase();
    return this.categories().filter(
      category => category.active && (!query || category.name.toLocaleLowerCase().includes(query))
    );
  });
  readonly visibleCategories = computed(() => this.matchingCategories().slice(0, 50));
  readonly duplicateLabels = computed(() => {
    const labels = this.rows()
      .map(row => row.name.trim().toLocaleLowerCase())
      .filter(Boolean);
    return new Set(labels).size !== labels.length;
  });
  readonly barcodeConflict = computed(() => this.barcodeConflictValue() !== null);
  readonly imagePreview = computed(() => {
    const pending = this.pendingImage();
    if (pending) return pending.previewUrl;
    if (this.imageRemovalPending()) return null;
    const path = this.imagePath();
    return path && !this.brokenImageState() ? this.pos.imageUrl(path) : null;
  });

  private rowSequence = 0;
  private loadRequest = 0;

  async initialize(request: ProductEditorRequest): Promise<void> {
    const loadRequest = ++this.loadRequest;
    this.reset();
    this.requestState.set(request);
    this.stepState.set(request.initialStep ?? 1);
    void this.loadTaxCategories(loadRequest);
    void this.pos.retryProductImageCleanup().catch(() => undefined);

    if (request.mode === 'create') {
      this.rowsState.set([this.emptyRow()]);
      return;
    }

    const product = request.product;
    this.name.setValue(product.name);
    this.manufacturer.setValue(this.manufacturerName(product.manufacturer_id));
    this.barcode.setValue(product.barcode ?? '');
    this.active.setValue(product.active);
    this.taxCategory.setValue(product.tax_category_id ?? '');
    this.imagePathState.set(product.image_path || null);
    this.loadingState.set(true);
    try {
      const [variants, categoryIds] = await Promise.all([
        this.pos.variantsForProduct(product.id),
        this.pos.productCategoryIds(product.id),
      ]);
      if (loadRequest !== this.loadRequest || this.product()?.id !== product.id) return;
      const rows = variants.map(variant => this.rowFromVariant(variant, variants.length));
      this.rowsState.set(rows.length > 0 ? rows : [this.emptyRow()]);
      this.familyCategoriesState.set(new Set(categoryIds));
      this.markPristine();
    } catch (error) {
      if (loadRequest === this.loadRequest) {
        this.errorState.set(this.message(error, 'Failed to load product variants'));
      }
    } finally {
      if (loadRequest === this.loadRequest) this.loadingState.set(false);
    }
  }

  ngOnDestroy(): void {
    ++this.loadRequest;
    this.clearPendingImage();
  }

  setStep(step: 1 | 2): void {
    if (step === 2 && !this.name.value.trim()) {
      this.validationTargetState.set('details');
      this.errorState.set('Enter a product name before adding variants.');
      return;
    }
    this.stepState.set(step);
    this.validationTargetState.set(null);
  }

  mutateRow(mutation: ProductEditorRowMutation): void {
    this.rowsState.update(rows =>
      rows.map((row, index) => (index === mutation.index ? { ...row, ...mutation.changes } : row))
    );
    this.rowsDirtyState.set(true);
  }

  addRow(): void {
    this.rowsState.update(rows => [...rows, this.emptyRow()]);
    this.rowsDirtyState.set(true);
  }

  removeRow(index: number): void {
    const rows = this.rows();
    if (rows.length === 1 || rows[index]?.variantId) return;
    this.rowsState.set(rows.filter((_, rowIndex) => rowIndex !== index));
    this.rowsDirtyState.set(true);
  }

  setCategoryQuery(value: string): void {
    this.categoryQueryState.set(value);
  }

  toggleCategory(categoryId: string): void {
    if (!this.canEditCategories()) return;
    this.familyCategoriesState.update(categories => {
      const next = new Set(categories);
      next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId);
      return next;
    });
    this.categoriesDirtyState.set(true);
  }

  productCategoryNames(): string[] {
    const selected = this.familyCategories();
    return this.categories()
      .filter(category => selected.has(category.id))
      .map(category => category.name);
  }

  canEditCategories(): boolean {
    return (
      this.permissions.has('ManageCatalog') &&
      this.connectivity.online() &&
      this.categoryMembershipsComplete()
    );
  }

  categoryDataStatusLabel(): string {
    return this.connectivity.online()
      ? 'Refreshing category data...'
      : 'Reconnect to load category data.';
  }

  stockOf(variantId: string): ProductEditorStockInfo | undefined {
    const request = this.request();
    return request?.mode === 'edit'
      ? (request.stock.get(variantId) ?? this.catalog.stock().get(variantId))
      : this.catalog.stock().get(variantId);
  }

  openFamilyScanner(): void {
    this.errorState.set(null);
    this.scannerTargetState.set('family');
  }

  openVariantScanner(index: number): void {
    this.errorState.set(null);
    this.scannerTargetState.set(index);
  }

  closeScanner(): void {
    this.scannerTargetState.set(null);
  }

  scanned(value: string): void {
    const target = this.scannerTarget();
    this.scannerTargetState.set(null);
    if (target === 'family') this.proposeFamilyBarcode(value);
    else if (target !== null) this.proposeRowBarcode(target, value);
  }

  confirmFamilyBarcode(): void {
    const barcode = this.pendingBarcode();
    if (!barcode) return;
    this.barcode.setValue(barcode);
    this.barcode.markAsDirty();
    this.pendingBarcodeState.set(null);
  }

  cancelFamilyBarcode(): void {
    this.pendingBarcodeState.set(null);
  }

  generateBarcode(index: number): void {
    this.proposeRowBarcode(index, generateDukarunBarcode());
  }

  confirmRowBarcode(index: number): void {
    const row = this.rows()[index];
    if (!row?.pendingBarcode) return;
    this.mutateRow({
      index,
      changes: { barcode: row.pendingBarcode, pendingBarcode: null },
    });
  }

  cancelRowBarcode(index: number): void {
    this.mutateRow({ index, changes: { pendingBarcode: null } });
  }

  effectiveBarcode(row: ProductEditorRow): string {
    return row.barcode.trim() || this.barcode.value.trim();
  }

  selectImage(pending: PendingProductImage): void {
    this.errorState.set(null);
    this.noticeState.set(null);
    this.clearPendingImage();
    this.pendingImageState.set(pending);
    this.imageRemovalPendingState.set(false);
  }

  imageSelectionFailed(message: string): void {
    this.errorState.set(message);
  }

  removeImage(): void {
    this.errorState.set(null);
    this.noticeState.set(null);
    if (this.pendingImage()) {
      this.clearPendingImage();
      return;
    }
    if (this.imageRemovalPending()) {
      this.imageRemovalPendingState.set(false);
      return;
    }
    if (this.imagePath()) this.imageRemovalPendingState.set(true);
  }

  markImageBroken(): void {
    if (!this.pendingImage()) this.brokenImageState.set(true);
  }

  isDirty(): boolean {
    return (
      this.name.dirty ||
      this.manufacturer.dirty ||
      this.barcode.dirty ||
      this.active.dirty ||
      this.taxCategory.dirty ||
      this.rowsDirtyState() ||
      this.categoriesDirtyState() ||
      this.pendingImage() !== null ||
      this.imageRemovalPending()
    );
  }

  async save(): Promise<ProductEditorResult | null> {
    const request = this.request();
    const name = this.name.value.trim();
    if (!request || this.loading()) return null;
    this.validationTargetState.set(null);
    if (!name) return this.invalid('Enter a product name.', 'details');
    if (this.duplicateLabels()) {
      return this.invalid('Variant labels must be unique.', 'variants');
    }
    const conflict = this.barcodeConflictValue();
    if (conflict) {
      return this.invalid(
        `Barcode "${conflict}" is already assigned to another active variant.`,
        'variants'
      );
    }
    if (this.barcode.value.trim().length > BARCODE_MAX_LENGTH) {
      return this.invalid(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`, 'details');
    }
    const variants = this.buildVariantInputs();
    if (!variants) return null;

    this.busyState.set(true);
    this.errorState.set(null);
    this.noticeState.set(null);
    let unattachedImagePath: string | null = null;
    try {
      const pendingImage = this.pendingImage();
      const previousImagePath = request.mode === 'edit' ? this.imagePath() : null;
      const imageChanged = pendingImage !== null || this.imageRemovalPending();
      if (pendingImage) {
        const companyId = this.supabase.claims()?.company_id;
        if (!companyId) throw new Error('No company in session - re-login');
        unattachedImagePath = await this.pos.uploadProductImage(
          companyId,
          pendingImage.blob,
          pendingImage.extension
        );
      }

      const manufacturerName = this.manufacturer.value.trim();
      const existingManufacturer = this.manufacturers().find(
        item => item.name.toLocaleLowerCase() === manufacturerName.toLocaleLowerCase()
      );
      const manufacturerId = manufacturerName
        ? (existingManufacturer?.id ?? (await this.pos.upsertManufacturer(manufacturerName)))
        : null;

      let productId: string;
      if (request.mode === 'create') {
        productId = await this.pos.createProductWithVariants({
          name,
          barcode: this.barcode.value.trim() || undefined,
          manufacturer_id: manufacturerId,
          ...(unattachedImagePath ? { image_path: unattachedImagePath } : {}),
          variants,
        });
        if (unattachedImagePath) {
          this.imagePathState.set(unattachedImagePath);
          this.brokenImageState.set(false);
          this.clearPendingImage();
          unattachedImagePath = null;
        }
        if (this.permissions.has('ManageCatalog') && this.taxCategory.value) {
          await this.tax.setProductCategory(productId, this.taxCategory.value);
        }
      } else {
        productId = request.product.id;
        await this.pos.updateProductWithVariants({
          product_id: productId,
          name,
          barcode: this.barcode.value.trim(),
          active: this.active.value,
          manufacturer_id: manufacturerId,
          image_changed: imageChanged,
          image_path: unattachedImagePath,
          expected_image_path: previousImagePath,
          variants,
        });
        if (imageChanged) {
          this.imagePathState.set(unattachedImagePath);
          this.brokenImageState.set(false);
          this.clearPendingImage();
          this.imageRemovalPendingState.set(false);
          unattachedImagePath = null;
          if (previousImagePath) void this.pos.cleanupProductImage(previousImagePath);
        }
        if (this.permissions.has('ManageCatalog') && this.connectivity.online()) {
          await this.pos.setProductCategories(productId, [...this.familyCategories()]);
          if ((request.product.tax_category_id ?? '') !== this.taxCategory.value) {
            await this.tax.setProductCategory(productId, this.taxCategory.value || null);
          }
        }
      }

      this.clearPendingImage();
      this.imageRemovalPendingState.set(false);
      this.markPristine();
      if (request.mode === 'create') {
        void this.learning.track(LEARNING_EVENT_NAMES.productCreated);
      }
      return {
        productId,
        mode: request.mode === 'create' ? 'created' : 'updated',
        name,
        variantCount: variants.length,
      };
    } catch (error) {
      if (unattachedImagePath) {
        await this.pos.scheduleProductImageCleanup(unattachedImagePath).catch(() => undefined);
      }
      const message = this.message(error, 'Save failed');
      this.errorState.set(
        (message.toLocaleLowerCase().includes('duplicate') &&
          message.toLocaleLowerCase().includes('barcode')) ||
          message.toLocaleLowerCase().includes('barcode_conflict')
          ? 'That barcode is already assigned to another variant.'
          : message.toLocaleLowerCase().includes('product_image_conflict')
            ? 'The product photo changed elsewhere. Reload the product and try again.'
            : message
      );
      return null;
    } finally {
      this.busyState.set(false);
    }
  }

  private invalid(message: string, target: 'details' | 'variants'): null {
    this.errorState.set(message);
    this.validationTargetState.set(target);
    this.stepState.set(target === 'details' ? 1 : 2);
    return null;
  }

  private buildVariantInputs(): CatalogVariantInput[] | null {
    const variants: CatalogVariantInput[] = [];
    for (const [index, row] of this.rows().entries()) {
      const label = row.name.trim() || `Variant ${index + 1}`;
      if (row.barcode.trim().length > BARCODE_MAX_LENGTH) {
        return this.invalid(`${label}: barcode is too long.`, 'variants');
      }
      const price = parseKes(row.price);
      if (price === null) return this.invalid(`${label}: enter a valid retail price.`, 'variants');
      const wholesalePrice = row.wholesale.trim() ? parseKes(row.wholesale) : null;
      if (row.wholesale.trim() && wholesalePrice === null) {
        return this.invalid(`${label}: enter a valid wholesale price.`, 'variants');
      }
      const isService = row.kind === 'service';
      const openingQuantity =
        !row.variantId && !isService && row.openingQuantity.trim()
          ? Number(row.openingQuantity)
          : 0;
      if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
        return this.invalid(`${label}: opening quantity must be zero or greater.`, 'variants');
      }
      if (openingQuantity > 0 && !row.trackInventory) {
        return this.invalid(`${label}: opening stock requires stock tracking.`, 'variants');
      }
      if (openingQuantity > 0 && !row.allowFractional && !Number.isInteger(openingQuantity)) {
        return this.invalid(
          `${label}: enable fractional quantities or enter a whole opening quantity.`,
          'variants'
        );
      }
      const openingUnitCost = row.openingUnitCost.trim() ? parseKes(row.openingUnitCost) : null;
      if (openingQuantity > 0 && openingUnitCost === null) {
        return this.invalid(`${label}: enter a valid opening unit cost.`, 'variants');
      }
      variants.push({
        ...(row.variantId ? { variant_id: row.variantId } : {}),
        ...(row.name.trim() ? { name: row.name.trim() } : {}),
        price,
        ...(row.sku.trim() ? { sku: row.sku.trim() } : {}),
        barcode: row.barcode.trim() || null,
        wholesale_price: wholesalePrice,
        kind: row.kind,
        track_inventory: isService ? false : row.trackInventory,
        allow_fractional: isService ? false : row.allowFractional,
        active: row.active,
        ...(openingQuantity > 0
          ? {
              opening_quantity: openingQuantity,
              opening_unit_cost: openingUnitCost!,
              ...(row.openingLocationId ? { opening_location_id: row.openingLocationId } : {}),
              ...(row.batchNumber.trim() ? { batch_number: row.batchNumber.trim() } : {}),
              ...(this.preferences.batchExpiryEnabled() && row.expiryDate
                ? { expiry_date: row.expiryDate }
                : {}),
            }
          : {}),
      });
    }
    return variants;
  }

  private barcodeConflictValue(): string | null {
    if (!this.activeValue()) return null;
    this.barcodeValue();
    const seen = new Set<string>();
    const editingProductId = this.product()?.id ?? null;
    const existing = new Set(
      this.catalog
        .catalog()
        .filter(
          variant =>
            variant.product_id !== editingProductId &&
            variant.variant_active &&
            variant.product_active &&
            !!variant.barcode?.trim()
        )
        .map(variant => variant.barcode!.trim())
    );
    for (const row of this.rows()) {
      if (!row.active) continue;
      const barcode = this.effectiveBarcode(row);
      if (!barcode) continue;
      if (seen.has(barcode) || existing.has(barcode)) return barcode;
      seen.add(barcode);
    }
    return null;
  }

  private proposeFamilyBarcode(value: string): void {
    const barcode = value.trim();
    if (!this.validateBarcode(barcode)) return;
    const current = this.barcode.value.trim();
    if (barcode === current) this.pendingBarcodeState.set(null);
    else if (current) this.pendingBarcodeState.set(barcode);
    else {
      this.barcode.setValue(barcode);
      this.barcode.markAsDirty();
    }
  }

  private proposeRowBarcode(index: number, value: string): void {
    const row = this.rows()[index];
    const barcode = value.trim();
    if (!row || !this.validateBarcode(barcode)) return;
    const current = this.effectiveBarcode(row);
    if (barcode === current) this.mutateRow({ index, changes: { pendingBarcode: null } });
    else if (current) this.mutateRow({ index, changes: { pendingBarcode: barcode } });
    else this.mutateRow({ index, changes: { barcode, pendingBarcode: null } });
  }

  private validateBarcode(barcode: string): boolean {
    if (!barcode) return false;
    if (barcode.length <= BARCODE_MAX_LENGTH) return true;
    this.errorState.set(`Barcodes can be at most ${BARCODE_MAX_LENGTH} characters.`);
    return false;
  }

  private emptyRow(): ProductEditorRow {
    return {
      key: `new-${++this.rowSequence}`,
      variantId: null,
      name: '',
      price: '',
      sku: '',
      barcode: '',
      pendingBarcode: null,
      wholesale: '',
      kind: 'good',
      trackInventory: true,
      allowFractional: false,
      openingQuantity: '',
      openingUnitCost: '',
      openingLocationId: this.locations.activeId() ?? this.stockLocations()[0]?.id ?? '',
      batchNumber: '',
      expiryDate: '',
      active: true,
    };
  }

  private rowFromVariant(variant: ProductVariant, variantCount: number): ProductEditorRow {
    return {
      ...this.emptyRow(),
      key: `variant-${variant.id}`,
      variantId: variant.id,
      name: variant.name === 'Default' && variantCount === 1 ? '' : variant.name,
      price: formatKesInput(variant.price),
      sku: variant.sku,
      barcode: variant.barcode ?? '',
      wholesale: variant.wholesale_price === null ? '' : formatKesInput(variant.wholesale_price),
      kind: variant.kind,
      trackInventory: variant.track_inventory,
      allowFractional: variant.allow_fractional,
      active: variant.active,
    };
  }

  private clearPendingImage(): void {
    const pending = this.pendingImage();
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    this.pendingImageState.set(null);
  }

  private async loadTaxCategories(request: number): Promise<void> {
    try {
      const settings = await this.tax.settings();
      if (request === this.loadRequest) this.taxCategoriesState.set(settings.categories);
    } catch {
      if (request === this.loadRequest) this.taxCategoriesState.set([]);
    }
  }

  private manufacturerName(id: string | null): string {
    if (!id) return '';
    return (
      this.manufacturers().find(manufacturer => manufacturer.id === id)?.name ??
      this.catalog.catalog().find(variant => variant.manufacturer_id === id)?.manufacturer_name ??
      ''
    );
  }

  private markPristine(): void {
    for (const control of [
      this.name,
      this.manufacturer,
      this.barcode,
      this.active,
      this.taxCategory,
    ]) {
      control.markAsPristine();
    }
    this.rowsDirtyState.set(false);
    this.categoriesDirtyState.set(false);
  }

  private reset(): void {
    this.clearPendingImage();
    this.name.reset('');
    this.manufacturer.reset('');
    this.barcode.reset('');
    this.active.reset(true);
    this.taxCategory.reset('');
    this.rowsState.set([]);
    this.loadingState.set(false);
    this.busyState.set(false);
    this.errorState.set(null);
    this.noticeState.set(null);
    this.familyCategoriesState.set(new Set());
    this.categoryQueryState.set('');
    this.pendingBarcodeState.set(null);
    this.scannerTargetState.set(null);
    this.imagePathState.set(null);
    this.imageRemovalPendingState.set(false);
    this.brokenImageState.set(false);
    this.rowsDirtyState.set(false);
    this.categoriesDirtyState.set(false);
    this.validationTargetState.set(null);
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
