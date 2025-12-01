import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppInitService } from '../../../core/services/app-init.service';
import { CompanyService } from '../../../core/services/company.service';
import { ProductService } from '../../../core/services/product.service';
import { ProductVariantService } from '../../../core/services/product/product-variant.service';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { HowSoldSelectorComponent } from './components/how-sold-selector.component';
import { IdentificationSelectorComponent } from './components/identification-selector.component';
import { ItemTypeSelectorComponent } from './components/item-type-selector.component';
import { LocationDisplayComponent } from './components/location-display.component';
import { MeasurementUnitSelectorComponent } from './components/measurement-unit-selector.component';
import { ProductNameInputComponent } from './components/product-name-input.component';
import { ServiceSkuEditorComponent } from './components/service-sku-editor.component';
import {
  SizeTemplate,
  SizeTemplateSelectorComponent,
} from './components/size-template-selector.component';
import { SkuListEditorComponent } from './components/sku-list-editor.component';
import { SubmitBarComponent } from './components/submit-bar.component';
import { ValidationIssuesPanelComponent } from './components/validation-issues-panel.component';
import { VariantDimensionEditorComponent } from './components/variant-dimension-editor.component';
import {
  HowSoldPreset,
  ItemType,
  ProductType,
  VariantDimension,
} from './types/product-creation.types';

/**
 * Product Creation Component - MEASURED vs DISCRETE Model
 *
 * ARCHITECTURE: Simple, modular, mobile-first
 *
 * FLOW:
 * 1. Choose item type: Product or Service
 * 2. For products: Choose MEASURED (fractional) or DISCRETE (whole units)
 * 3. Configure variants and generate SKUs automatically
 * 4. Set prices and stock for each SKU
 *
 * DESIGN PRINCIPLES:
 * - Each component handles ONE concern
 * - No over-engineering - build only what's needed
 * - Mobile-first with progressive disclosure
 * - Clear visual feedback for fractional vs discrete
 */
@Component({
  selector: 'app-product-create',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ItemTypeSelectorComponent,
    HowSoldSelectorComponent,
    ProductNameInputComponent,
    IdentificationSelectorComponent,
    MeasurementUnitSelectorComponent,
    SizeTemplateSelectorComponent,
    VariantDimensionEditorComponent,
    SkuListEditorComponent,
    LocationDisplayComponent,
    ServiceSkuEditorComponent,
    ValidationIssuesPanelComponent,
    SubmitBarComponent,
  ],
  templateUrl: './product-create.component.html',
  styleUrl: './product-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCreateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);
  private readonly variantService = inject(ProductVariantService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly appInitService = inject(AppInitService);
  readonly companyService = inject(CompanyService);

  /**
   * Whether dashboard initialization is complete (locations loaded)
   * Template should wait for this before rendering the form
   */
  readonly isReady = this.appInitService.isReady;

  // View references (for photo upload in submit)
  readonly identificationSelector =
    viewChild<IdentificationSelectorComponent>('identificationSelector');

  // Edit mode
  readonly isEditMode = signal(false);
  readonly productId = signal<string | null>(null);

  // New model: Item type, product type and how it's sold (2-stage flow)
  readonly itemType = signal<ItemType>('product');
  readonly productType = signal<ProductType | null>(null);
  readonly measurementUnit = signal<string | null>(null);
  readonly variantDimensions = signal<VariantDimension[]>([]);
  readonly howSoldPreset = signal<HowSoldPreset | null>(null);
  readonly selectedSizeTemplate = signal<SizeTemplate>(null);
  readonly currentStage = signal<1 | 2>(1);

  // Form: Product + Multiple SKUs
  readonly productForm: FormGroup;

  // Unique suffix for this form session (to ensure SKU uniqueness)
  private readonly skuUniqueSuffix = Date.now().toString().slice(-6);

  // Computed: SKUs FormArray
  get skus(): FormArray {
    return this.productForm.get('skus') as FormArray;
  }

  // Getters for form controls
  get nameControl(): FormControl {
    return this.productForm.get('name') as FormControl;
  }

  get barcodeControl(): FormControl {
    return this.productForm.get('barcode') as FormControl;
  }

  get firstSkuFormGroup(): FormGroup {
    return this.skus.at(0) as FormGroup;
  }

  // Submission state
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal(false);

  // Computed: Combined loading state (component + service)
  readonly isLoading = computed(() => this.isSubmitting() || this.productService.isCreating());

  // Default location for the active channel (from StockLocationService)
  readonly defaultLocation = this.stockLocationService.defaultLocation;

  // Identification method chosen
  readonly identificationMethod = signal<'barcode' | 'label-photos' | null>('barcode');
  readonly photoCount = signal(0);
  readonly barcodeValue = signal<string>(''); // Track barcode as signal
  readonly productNameValue = signal<string>(''); // Track name as signal
  readonly productNameValid = signal<boolean>(false); // Track name validity
  readonly skuValidityTrigger = signal<number>(0); // Trigger to recompute SKU validation
  readonly formValid = signal<boolean>(false); // Track overall form validity

  // Computed: Has valid identification
  readonly hasValidIdentification = computed(() => {
    const method = this.identificationMethod();
    if (method === 'barcode') {
      return !!this.barcodeValue()?.trim();
    }
    if (method === 'label-photos') {
      return this.photoCount() >= 5;
    }
    return false;
  });

  // Computed: Form validity
  // Note: Location is guaranteed by isReady gate in template
  readonly canSubmit = computed(() => {
    const isValid = this.formValid(); // Use signal instead of direct form access
    const notLoading = !this.isLoading();
    const hasIdentification = this.hasValidIdentification();

    return isValid && notLoading && hasIdentification;
  });

  // Computed: Validation issues
  // Note: Location validation removed - guaranteed by isReady gate in template
  readonly validationIssues = computed(() => {
    const issues: string[] = [];
    const stage = this.currentStage();

    if (!this.hasValidIdentification()) {
      issues.push(`Barcode OR 5+ label photos`);
    }
    if (!this.productNameValid()) issues.push('Product name required');

    // SKU validation only matters once we're in Stage 2
    if (stage === 2) {
      // SKU validation (trigger ensures recomputation)
      this.skuValidityTrigger(); // Access signal to track changes

      if (this.skus.length === 0) {
        issues.push('At least 1 SKU required');
      } else {
        // Check for invalid SKUs - must have name, sku, price and stock
        const invalidSkus = this.skus.controls.filter((sku) => {
          const name = sku.get('name');
          const skuCode = sku.get('sku');
          const price = sku.get('price');
          const stock = sku.get('stockOnHand');

          return name?.invalid || skuCode?.invalid || price?.invalid || stock?.invalid;
        }).length;

        if (invalidSkus > 0) {
          issues.push(`${invalidSkus} SKU(s) have errors`);
        }

        // Check for duplicate SKU codes
        const skuCodes = this.skus.controls
          .map((sku) => sku.get('sku')?.value?.trim().toUpperCase())
          .filter((code) => code);
        const uniqueSkuCodes = new Set(skuCodes);
        if (skuCodes.length !== uniqueSkuCodes.size) {
          issues.push('Duplicate SKU codes detected');
        }
      }
    }

    return issues;
  });

  constructor() {
    // Initialize form: Product info + Multiple SKUs
    this.productForm = this.fb.group({
      // Product level - Identification (choose ONE method)
      barcode: [''], // Method 1: Scan/enter barcode (for packaged goods)
      // Method 2: Label photos handled via PhotoManagerComponent (for fresh produce)

      // Product level - Basic info
      name: ['', [Validators.required, Validators.minLength(3)]],

      // SKU level - Multiple variants (FormArray)
      skus: this.fb.array([]), // Start empty, will add one SKU in ngOnInit
    });
  }

  async ngOnInit(): Promise<void> {
    // Check if we're in edit mode
    const productId = this.route.snapshot.paramMap.get('id');
    if (productId) {
      this.isEditMode.set(true);
      this.productId.set(productId);
      await this.loadProductForEdit(productId);
      this.currentStage.set(2);
    }

    // Watch for manual barcode entry
    this.productForm.get('barcode')?.valueChanges.subscribe((value) => {
      // Update signal to trigger reactive updates
      this.barcodeValue.set(value || '');

      const trimmedValue = value?.trim();
      if (trimmedValue && trimmedValue.length > 0) {
        // User is typing a barcode - auto-select barcode method
        if (this.identificationMethod() !== 'barcode') {
          this.identificationMethod.set('barcode');
        }
      }
    });

    // Watch for product name changes
    this.productForm.get('name')?.valueChanges.subscribe((value) => {
      this.productNameValue.set(value || '');
      const control = this.productForm.get('name');
      this.productNameValid.set(control?.valid || false);
    });

    // Watch for SKU array changes
    this.skus.valueChanges.subscribe(() => {
      // Trigger recomputation of SKU validation
      this.skuValidityTrigger.update((v) => v + 1);
      // Update form validity
      this.formValid.set(this.productForm.valid);
    });

    this.skus.statusChanges.subscribe(() => {
      // Trigger recomputation when validity changes
      this.skuValidityTrigger.update((v) => v + 1);
      // Update form validity
      this.formValid.set(this.productForm.valid);
    });

    // Watch for overall form validity changes
    this.productForm.statusChanges.subscribe(() => {
      this.formValid.set(this.productForm.valid);
    });

    // Initialize signals with current values
    this.productNameValue.set(this.productForm.get('name')?.value || '');
    this.productNameValid.set(this.productForm.get('name')?.valid || false);
    this.barcodeValue.set(this.productForm.get('barcode')?.value || '');
    this.formValid.set(this.productForm.valid);
  }

  /**
   * Create a new SKU FormGroup
   */
  private createSkuFormGroup(
    skuCode: string = '',
    name: string = '',
    price: number = 1,
    stock: number = 0,
    allowFractionalQuantity: boolean = false,
    wholesalePrice: number = 0,
    variantId: string | null = null,
  ): FormGroup {
    return this.fb.group({
      variantId: [variantId], // Store variant ID for updates (null for new SKUs)
      name: [name, [Validators.required, Validators.minLength(1)]],
      sku: [skuCode, [Validators.required, Validators.minLength(1), Validators.maxLength(50)]],
      price: [price, [Validators.required, Validators.min(1)]],
      stockOnHand: [stock, [Validators.required, Validators.min(0)]],
      allowFractionalQuantity: [allowFractionalQuantity],
      wholesalePrice: [wholesalePrice, [Validators.min(0)]],
    });
  }

  /**
   * Build a unique, human-readable SKU from a base code and index.
   * This runs when the variants form (SKUs list) is generated/modified,
   * so the user sees the final SKU before submit.
   */
  private buildUniqueSkuCode(base: string, index: number): string {
    const cleanedBase = (base || 'SKU').trim().toUpperCase();
    const safeBase = cleanedBase.length > 0 ? cleanedBase : 'SKU';
    return `${safeBase}-${this.skuUniqueSuffix}-${index}`;
  }

  // ============================================================================
  // NEW MODEL METHODS
  // ============================================================================

  /**
   * Set item type (product or service)
   */
  setItemType(type: ItemType): void {
    this.itemType.set(type);
    if (type === 'service') {
      this.productType.set(null);
      this.measurementUnit.set(null);
      this.variantDimensions.set([]);
      this.howSoldPreset.set(null);
      this.generateSkus();
    } else {
      // Reset product-specific configuration
      this.productType.set(null);
      this.measurementUnit.set(null);
      this.variantDimensions.set([]);
      this.howSoldPreset.set(null);
      this.skus.clear();
      this.skuValidityTrigger.update((v) => v + 1);
    }

    // Always return to Stage 1 when switching type in create flow (edit mode handled separately)
    if (!this.isEditMode()) {
      this.currentStage.set(1);
    }
  }

  /**
   * Set product type (measured or discrete)
   */
  setProductType(type: ProductType): void {
    this.productType.set(type);
    // Product type is now mostly driven by howSoldPreset.
    // We still regenerate SKUs when type is changed manually (edit mode).
    this.generateSkus();
  }

  /**
   * Set measurement unit for measured products
   */
  setMeasurementUnit(unit: string): void {
    this.measurementUnit.set(unit);
    this.generateSkus();
  }

  /**
   * Add a new variant dimension
   */
  addVariantDimension(): void {
    const newDimension: VariantDimension = {
      id: Date.now().toString(),
      name: '',
      options: [],
    };
    this.variantDimensions.update((dims) => [...dims, newDimension]);
  }

  /**
   * Remove a variant dimension
   */
  removeVariantDimension(id: string): void {
    this.variantDimensions.update((dims) => dims.filter((dim) => dim.id !== id));
    this.generateSkus();
  }

  /**
   * Move back to Stage 1 (setup) without touching SKUs.
   */
  goToStage1(): void {
    this.submitError.set(null);
    this.currentStage.set(1);
  }

  /**
   * Update dimension options from array or comma-separated string
   */
  updateDimensionOptions(id: string, options: string[] | string): void {
    const optionsArray = Array.isArray(options)
      ? options
      : options
        .split(',')
        .map((opt) => opt.trim())
        .filter((opt) => opt);
    this.variantDimensions.update((dims) =>
      dims.map((dim) => (dim.id === id ? { ...dim, options: optionsArray } : dim)),
    );
    this.generateSkus();
  }

  /**
   * Handle high-level "how it's sold" preset selection.
   * This sets sensible defaults for productType, measurementUnit and dimensions,
   * then generates SKUs ready for Stage 2 (pricing).
   */
  onHowSoldSelected(preset: HowSoldPreset): void {
    this.howSoldPreset.set(preset);

    // Reset size template when changing presets
    this.selectedSizeTemplate.set(null);

    // All presets apply to products, not services
    this.itemType.set('product');

    if (preset === 'single-item') {
      // One discrete SKU, no dimensions
      this.productType.set('discrete');
      this.measurementUnit.set(null);
      this.variantDimensions.set([]);
    } else if (preset === 'multi-variant') {
      // Discrete variants - wait for template selection to populate options
      this.productType.set('discrete');
      this.measurementUnit.set(null);
      // Start with empty dimension, template selector will populate
      const baseDimension: VariantDimension = {
        id: Date.now().toString(),
        name: 'Size / Pack size',
        options: [],
      };
      this.variantDimensions.set([baseDimension]);
    } else if (preset === 'by-weight-kg') {
      this.productType.set('measured');
      this.measurementUnit.set('KG');
      this.variantDimensions.set([]);
    } else if (preset === 'by-volume-litre') {
      this.productType.set('measured');
      this.measurementUnit.set('L');
      this.variantDimensions.set([]);
    }

    this.generateSkus();
  }

  /**
   * Handle size template selection from size-template-selector.
   * This populates the variant dimension with preset options.
   */
  onSizeTemplateChange(template: SizeTemplate): void {
    this.selectedSizeTemplate.set(template);

    // Template definitions
    const templateOptions: Record<Exclude<SizeTemplate, null>, string[]> = {
      clothing: ['S', 'M', 'L', 'XL'],
      packs: ['1-pack', '3-pack', '6-pack', '12-pack'],
      custom: [],
    };

    const options = template ? templateOptions[template] : [];
    const dimensionName = options.length > 0 ? 'Size' : 'Size / Pack size';

    const baseDimension: VariantDimension = {
      id: Date.now().toString(),
      name: dimensionName,
      options: options,
    };
    this.variantDimensions.set([baseDimension]);

    this.generateSkus();
  }

  /**
   * Move from Stage 1 (setup) to Stage 2 (pricing & stock).
   * Validates minimum Stage 1 requirements: name + identification.
   */
  goToStage2(): void {
    const nameControl = this.productForm.get('name');
    if (nameControl) {
      nameControl.markAsTouched();
    }

    const hasName = !!nameControl && nameControl.valid;
    const hasId = this.hasValidIdentification();

    if (!hasName || !hasId) {
      this.submitError.set(
        'Add a product name and a barcode or 5+ label photos before continuing.',
      );
      return;
    }

    this.submitError.set(null);

    // Ensure SKUs exist for products
    if (this.itemType() === 'product' && this.skus.length === 0) {
      this.generateSkus();

      if (this.skus.length === 0) {
        const defaultName = this.productForm.get('name')?.value || 'Product';
        const baseSku = this.generateSku(defaultName);
        const code = this.buildUniqueSkuCode(baseSku, 1);
        this.skus.push(
          this.createSkuFormGroup(code, defaultName, 1, 0, this.productType() === 'measured', 0, null),
        );
      }
    }

    // Ensure a SKU exists for services
    if (this.itemType() === 'service' && this.skus.length === 0) {
      this.generateSkus();
    }

    this.currentStage.set(2);
  }

  /**
   * Generate SKUs based on current configuration
   */
  generateSkus(): void {
    this.skus.clear();

    if (this.itemType() === 'service') {
      this.generateServiceSkus();
    } else if (this.productType() === 'measured') {
      this.generateMeasuredSkus();
    } else if (this.productType() === 'discrete') {
      this.generateDiscreteSkus();
    }

    // Trigger validation update
    this.skuValidityTrigger.update((v) => v + 1);
  }

  /**
   * Generate SKUs for services (single SKU)
   */
  private generateServiceSkus(): void {
    const productName = this.productForm.get('name')?.value || 'Service';
    const index = 1;
    const baseSku = this.generateSku(productName);
    const skuCode = this.buildUniqueSkuCode(baseSku, index);
    const skuGroup = this.createSkuFormGroup(skuCode, productName, 1, 0, false, 0, null);
    this.skus.push(skuGroup);
  }

  /**
   * Generate SKUs for measured products
   */
  private generateMeasuredSkus(): void {
    const unit = this.measurementUnit() || 'UNIT';
    const dimensions = this.variantDimensions();

    if (dimensions.length === 0) {
      // Pure measured: just the unit
      const index = this.skus.length + 1;
      const baseSku = this.generateSku(unit);
      const skuCode = this.buildUniqueSkuCode(baseSku, index);
      this.skus.push(this.createSkuFormGroup(skuCode, unit, 1, 0, true, 0, null));
    } else {
      // Measured with variants: "Grade A - KG", "Grade B - KG"
      dimensions[0].options.forEach((option) => {
        const name = `${option} - ${unit}`;
        const index = this.skus.length + 1;
        const baseSku = this.generateSku(name);
        const skuCode = this.buildUniqueSkuCode(baseSku, index);
        this.skus.push(this.createSkuFormGroup(skuCode, name, 1, 0, true, 0, null));
      });
    }
  }

  /**
   * Generate SKUs for discrete products
   */
  private generateDiscreteSkus(): void {
    const dimensions = this.variantDimensions();

    if (dimensions.length === 0) {
      // Single discrete SKU
      const name = this.productForm.get('name')?.value || 'Product';
      const index = this.skus.length + 1;
      const baseSku = this.generateSku(name);
      const skuCode = this.buildUniqueSkuCode(baseSku, index);
      this.skus.push(this.createSkuFormGroup(skuCode, name, 1, 0, false, 0, null));
    } else if (dimensions.length === 1) {
      // Single dimension: "Red", "Blue", "Yellow"
      dimensions[0].options.forEach((option) => {
        const index = this.skus.length + 1;
        const baseSku = this.generateSku(option);
        const skuCode = this.buildUniqueSkuCode(baseSku, index);
        this.skus.push(this.createSkuFormGroup(skuCode, option, 1, 0, false, 0, null));
      });
    } else {
      // Multiple dimensions: Cartesian product
      this.generateCartesianProduct(dimensions).forEach((combination) => {
        const name = combination.join(' - ');
        const index = this.skus.length + 1;
        const baseSku = this.generateSku(name);
        const skuCode = this.buildUniqueSkuCode(baseSku, index);
        this.skus.push(this.createSkuFormGroup(skuCode, name, 1, 0, false, 0, null));
      });
    }
  }

  /**
   * Generate all combinations from multiple dimensions
   */
  private generateCartesianProduct(dimensions: VariantDimension[]): string[][] {
    return dimensions.reduce((acc, dim) => {
      if (acc.length === 0) return dim.options.map((opt) => [opt]);
      return acc.flatMap((combo) => dim.options.map((opt) => [...combo, opt]));
    }, [] as string[][]);
  }

  /**
   * Add a new SKU to the list (manual override)
   */
  addSku(): void {
    const productName = this.productForm.get('name')?.value || '';
    const index = this.skus.length + 1;

    // Auto-generate SKU code
    const baseSku = productName ? this.generateSku(productName) : 'SKU';
    const skuCode = this.buildUniqueSkuCode(baseSku, index);

    // Create SKU with pre-filled code to avoid validation issues
    const skuGroup = this.createSkuFormGroup(skuCode, '', 0, 0, false, 0, null);
    this.skus.push(skuGroup);

    // Trigger validation update
    this.skuValidityTrigger.update((v) => v + 1);
  }

  /**
   * Remove SKU at index
   */
  removeSku(index: number): void {
    if (this.skus.length > 1) {
      this.skus.removeAt(index);
      // Trigger validation update
      this.skuValidityTrigger.update((v) => v + 1);
    }
  }

  /**
   * Generate SKU from product name
   */
  private generateSku(name: string): string {
    if (!name?.trim()) return '';

    return name
      .trim()
      .substring(0, 8)
      .toUpperCase()
      .replace(/\s/g, '-')
      .replace(/[^A-Z0-9-]/g, '');
  }

  /**
   * Check if SKU appears to be auto-generated from name
   */
  private isAutoGeneratedSku(sku: string, name: string): boolean {
    const generated = this.generateSku(name);
    return sku === generated;
  }

  /**
   * Choose identification method
   */
  chooseIdentificationMethod(method: 'barcode' | 'label-photos'): void {
    this.identificationMethod.set(method);

    // Clear other method
    if (method !== 'barcode') {
      this.productForm.patchValue({ barcode: '' });
      this.barcodeValue.set('');
    }
    if (method !== 'label-photos') {
      this.photoCount.set(0);
    }
  }

  /**
   * Handle barcode scanned
   */
  onBarcodeScanned(barcode: string): void {
    this.productForm.patchValue({ barcode });
    this.barcodeValue.set(barcode);
    this.identificationMethod.set('barcode');
    console.log('Barcode scanned:', barcode);
  }

  /**
   * Handle label photos uploaded
   */
  onPhotosChanged(photos: File[]): void {
    this.photoCount.set(photos.length);
    if (photos.length >= 5) {
      this.identificationMethod.set('label-photos');
    }
  }

  /**
   * Load product data for editing
   */
  private async loadProductForEdit(productId: string): Promise<void> {
    try {
      const product = await this.productService.getProductById(productId);
      if (!product) {
        this.submitError.set('Product not found');
        return;
      }

      // Populate form with product data
      this.productForm.patchValue({
        name: product.name,
        barcode: product.customFields?.barcode || '',
      });

      // Set identification method based on existing data
      if (product.customFields?.barcode) {
        this.identificationMethod.set('barcode');
        this.barcodeValue.set(product.customFields.barcode);
      }

      // Determine item type: Check if any variant has trackInventory: false → service
      const isService = product.variants?.some(
        (variant: any) => variant.trackInventory === false,
      );
      if (isService) {
        this.itemType.set('service');
      } else {
        this.itemType.set('product');
      }

      // Load variants as SKUs
      if (product.variants && product.variants.length > 0) {
        // Determine product type from first variant's allowFractionalQuantity
        const firstVariant = product.variants[0];
        const allowFractional = firstVariant.customFields?.allowFractionalQuantity || false;

        if (!isService) {
          // Determine product type: measured vs discrete
          if (allowFractional) {
            this.productType.set('measured');
            // Try to extract measurement unit from variant name (e.g., "Product - KG" or just "KG")
            const variantName = firstVariant.name || '';
            const unitMatch = variantName.match(/\b(KG|L|G|ML|KG|LITRE|LITER)\b/i);
            if (unitMatch) {
              const unit = unitMatch[0].toUpperCase();
              // Normalize units
              if (unit === 'LITRE' || unit === 'LITER') {
                this.measurementUnit.set('L');
              } else if (unit === 'G') {
                this.measurementUnit.set('G');
              } else if (unit === 'ML') {
                this.measurementUnit.set('ML');
              } else {
                this.measurementUnit.set(unit);
              }
            } else {
              // Default to KG if we can't determine
              this.measurementUnit.set('KG');
            }
          } else {
            this.productType.set('discrete');
          }
        }

        // Restore all SKUs with variant IDs
        product.variants.forEach((variant: any) => {
          // Convert price from cents to decimal
          const priceDecimal = variant.priceWithTax / 100;
          // Convert wholesalePrice from cents to decimal (if exists)
          const wholesalePriceDecimal = variant.customFields?.wholesalePrice
            ? variant.customFields.wholesalePrice / 100
            : 0;

          const skuGroup = this.createSkuFormGroup(
            variant.sku,
            variant.name,
            priceDecimal,
            variant.stockOnHand || 0,
            variant.customFields?.allowFractionalQuantity || false,
            wholesalePriceDecimal,
            variant.id, // Store variant ID for updates
          );
          this.skus.push(skuGroup);
        });

        // Trigger validation update
        this.skuValidityTrigger.update((v) => v + 1);
      }

      // Set initial stage to 2 (pricing) since basics are already filled
      this.currentStage.set(2);
    } catch (error: any) {
      console.error('Failed to load product:', error);
      this.submitError.set('Failed to load product data');
    }
  }

  // Removed toggleItemType - now always products only

  /**
   * Update validators for all SKU forms based on current item type
   */
  private updateSkuValidators(): void {
    this.skus.controls.forEach((skuGroup) => {
      const stockControl = skuGroup.get('stockOnHand');
      if (stockControl) {
        // All products require stock validation
        stockControl.setValidators([Validators.required, Validators.min(0)]);
        stockControl.updateValueAndValidity();
      }
    });

    // Trigger validation update
    this.skuValidityTrigger.update((v) => v + 1);
  }

  /**
   * Submit form - creates product/service with multiple SKUs
   */
  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      // Mark all fields as touched to show validation errors
      this.productForm.markAllAsTouched();
      this.markFormArrayTouched(this.skus);
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(false);

    try {
      const formValue = this.productForm.value;

      // Location is guaranteed by isReady gate, but assert defensively
      const stockLocationId = this.defaultLocation()?.id;
      if (!stockLocationId) {
        console.error('Unexpected: No location available during submit');
        this.submitError.set('System error: Location not available. Please refresh the page.');
        this.isSubmitting.set(false);
        return;
      }

      // Product/Service input
      const productInput = {
        name: formValue.name.trim(),
        description: '',
        enabled: true,
        barcode: formValue.barcode?.trim() || undefined,
      };

      // Multiple variant inputs from SKUs FormArray
      // All variants are products with tracked inventory
      console.log('Form data before processing:', formValue);
      console.log('SKUs from form:', formValue.skus);

      const variantInputs = formValue.skus.map((sku: any, index: number) => {
        console.log(`Processing SKU ${index + 1}:`, sku);

        return {
          sku: sku.sku.trim().toUpperCase(),
          name: sku.name.trim(),
          price: Number(sku.price),
          trackInventory: true, // Products: track stock
          stockOnHand: Number(sku.stockOnHand),
          stockLocationId: stockLocationId!,
          customFields: {
            wholesalePrice: sku.wholesalePrice ? Number(sku.wholesalePrice) * 100 : null, // Convert to cents
            allowFractionalQuantity: Boolean(sku.allowFractionalQuantity),
          },
        };
      });

      console.log('Final variant inputs:', variantInputs);

      // Handle edit mode vs create mode
      if (this.isEditMode() && this.productId()) {
        // EDIT MODE: Update existing product
        const productId = this.productId()!;

        // Separate existing variants (with variantId) from new variants (without variantId)
        const existingVariants = formValue.skus
          .filter((sku: any) => sku.variantId)
          .map((sku: any) => ({
            id: sku.variantId,
            name: sku.name.trim(),
            price: Number(sku.price),
          }));

        const newVariants = formValue.skus
          .filter((sku: any) => !sku.variantId)
          .map((sku: any) => ({
            sku: sku.sku.trim().toUpperCase(),
            name: sku.name.trim(),
            price: Number(sku.price),
            trackInventory: this.itemType() === 'product', // true for products, false for services
            stockOnHand: Number(sku.stockOnHand),
            stockLocationId: stockLocationId!,
            customFields: {
              wholesalePrice: sku.wholesalePrice ? Number(sku.wholesalePrice) * 100 : null,
              allowFractionalQuantity: Boolean(sku.allowFractionalQuantity),
            },
          }));

        // Update product name and barcode
        const updated = await this.productService.updateProductWithVariants(
          productId,
          productInput.name,
          existingVariants,
          productInput.barcode,
        );

        if (!updated) {
          const error = this.productService.error();
          this.submitError.set(error || 'Failed to update product');
          return;
        }

        // Create new variants if any
        if (newVariants.length > 0) {
          console.log('Creating new variants for existing product:', newVariants.length);
          const createdVariants = await this.variantService.createVariants(productId, newVariants);
          if (!createdVariants || createdVariants.length === 0) {
            this.submitError.set('Product updated, but failed to create new variants');
            return;
          }
          console.log(`Created ${createdVariants.length} new variant(s)`);
        }

        console.log('Product update complete');
        
        // Note: Audit trail entries are automatically created by the backend
        // when product updates occur via the updateProduct mutation.
        // The backend tracks: eventType, entityType, entityId, and changed data.
        console.log('Audit trail: Product update logged automatically by backend');

        this.submitSuccess.set(true);

        // Navigate after a delay
        setTimeout(() => {
          this.router.navigate(['/dashboard/products']);
        }, 1500);
      } else {
        // CREATE MODE: Create new product
        const productId = await this.productService.createProductWithVariants(
          productInput,
          variantInputs,
        );

        if (productId) {
          console.log('Transaction Phase 1 COMPLETE: Product & Variants created');

          // Upload photos if any were added (Phase 2 - non-blocking)
          const identificationSelector = this.identificationSelector();
          if (identificationSelector) {
            const photoManager = identificationSelector.photoManager();
            if (photoManager) {
              const photos = photoManager.getPhotos();
              if (photos.length > 0) {
                console.log(`Transaction Phase 2: Uploading ${photos.length} photo(s)...`);
                try {
                  const assetIds = await this.productService.uploadProductPhotos(productId, photos);
                  if (assetIds && assetIds.length > 0) {
                    console.log('Transaction Phase 2 COMPLETE: Photos uploaded');
                    this.submitSuccess.set(true);
                  } else {
                    console.warn('Transaction Phase 2 FAILED: Photos upload failed');
                    console.warn('But product was successfully created (photos can be added later)');
                    // Show partial success message
                    this.submitError.set(
                      'Product created, but photo upload failed. You can add photos later.',
                    );
                  }
                } catch (photoError: any) {
                  console.error('Photo upload error:', photoError);
                  this.submitError.set(
                    'Product created, but photo upload failed. You can add photos later.',
                  );
                }
              } else {
                console.log('No photos to upload');
                this.submitSuccess.set(true);
              }
            } else {
              this.submitSuccess.set(true);
            }
          } else {
            this.submitSuccess.set(true);
          }

          // Navigate after a delay to show success/warning message
          setTimeout(() => {
            this.router.navigate(['/dashboard/products']);
          }, 1500);
        } else {
          const error = this.productService.error();
          this.submitError.set(error || `Failed to create product`);
        }
      }
    } catch (error: any) {
      console.error(`${this.itemType()} creation failed:`, error);
      this.submitError.set(error.message || 'An unexpected error occurred');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Submit form (wrapper for handling button click)
   */
  submitForm(): void {
    this.onSubmit();
  }

  /**
   * Cancel and go back to products list
   */
  cancel(): void {
    this.router.navigate(['/dashboard/products']);
  }

  // --- Validation Helper Methods ---

  /**
   * Mark all controls in a FormArray as touched
   */
  private markFormArrayTouched(formArray: FormArray): void {
    formArray.controls.forEach((control) => {
      if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach((key) => {
          control.get(key)?.markAsTouched();
        });
      } else {
        control.markAsTouched();
      }
    });
  }

  /**
   * Check if a SKU field has an error
   */
  skuFieldHasError(skuIndex: number, fieldName: string): boolean {
    const control = this.skus.at(skuIndex)?.get(fieldName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /**
   * Get error message for a SKU field
   */
  getSkuFieldError(skuIndex: number, fieldName: string): string {
    const control = this.skus.at(skuIndex)?.get(fieldName);
    if (!control?.errors) return '';

    const errors = control.errors;
    if (errors['required']) return 'Required';
    if (errors['minlength']) return `Min ${errors['minlength'].requiredLength} chars`;
    if (errors['maxlength']) return `Max ${errors['maxlength'].requiredLength} chars`;
    if (errors['min']) return `Min value: ${errors['min'].min}`;

    return 'Invalid';
  }

  /**
   * Debug: Get detailed SKU validation state (for development)
   */
  getSkuValidationDebug(skuIndex: number): string {
    const sku = this.skus.at(skuIndex);
    if (!sku) return 'SKU not found';

    const name = sku.get('name');
    const skuCode = sku.get('sku');
    const price = sku.get('price');
    const stock = sku.get('stockOnHand');

    const errors: string[] = [];
    if (name?.invalid) errors.push(`name(${name.value || 'empty'})`);
    if (skuCode?.invalid) errors.push(`sku(${skuCode.value || 'empty'})`);
    if (price?.invalid) errors.push(`price(${price.value})`);
    if (stock?.invalid) errors.push(`stock(${stock.value})`);

    return errors.length > 0 ? errors.join(', ') : 'Valid';
  }
}
