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
import { ProductService } from '../../../core/services/product.service';
import { ProductNameInputComponent } from '../product-create/components/product-name-input.component';
import { ValidationIssuesPanelComponent } from '../product-create/components/validation-issues-panel.component';
import { PhotoEditUnlockModalComponent } from './components/photo-edit-unlock-modal.component';
import { PhotoEditorComponent, ProductAsset } from './components/photo-editor.component';

/**
 * Product Edit Component
 *
 * Focused on editing product metadata (name, SKU names, prices)
 * Stock is read-only - use inventory module for stock adjustments
 * Reuses form components but with edit-specific validation and flow
 */
@Component({
  selector: 'app-product-edit',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PhotoEditUnlockModalComponent,
    PhotoEditorComponent,
    ProductNameInputComponent,
    ValidationIssuesPanelComponent,
  ],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);

  // Product ID from route
  readonly productId = signal<string | null>(null);
  readonly isLoading = signal(false);

  // 2-stage flow for editing (defaults to details)
  readonly currentStage = signal<1 | 2>(1);

  // Form
  readonly productForm: FormGroup;

  // Submission state
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal(false);

  // Photo editing state
  readonly showPhotoEditor = signal(false);
  readonly showUnlockModal = signal(false);
  readonly productAssets = signal<ProductAsset[]>([]);
  readonly isUpdatingPhotos = signal(false);

  // View child reference
  readonly photoEditor = viewChild<PhotoEditorComponent>('photoEditor');

  // Computed: SKUs FormArray
  get skus(): FormArray {
    return this.productForm.get('skus') as FormArray;
  }

  // Convenience getter for name control (used by shared name input component)
  get nameControl(): FormControl {
    return this.productForm.get('name') as FormControl;
  }

  // Computed: Form validity
  readonly canSubmit = computed(() => {
    return this.productForm.valid && !this.isSubmitting();
  });

  // Computed: Validation issues
  readonly validationIssues = computed(() => {
    const issues: string[] = [];

    if (!this.productForm.get('name')?.valid) {
      issues.push('Product name required');
    }

    if (this.skus.length === 0) {
      issues.push('At least 1 SKU required');
    } else {
      const invalidSkus = this.skus.controls.filter((sku) => {
        return sku.get('name')?.invalid || sku.get('price')?.invalid;
      }).length;

      if (invalidSkus > 0) {
        issues.push(`${invalidSkus} SKU(s) have errors`);
      }
    }

    return issues;
  });

  constructor() {
    // Initialize form
    this.productForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      skus: this.fb.array([]),
    });
  }

  // --- Stage navigation helpers ---

  goToStage1(): void {
    this.currentStage.set(1);
  }

  goToStage2(): void {
    this.currentStage.set(2);
  }

  async ngOnInit(): Promise<void> {
    const productId = this.route.snapshot.paramMap.get('id');
    if (!productId) {
      this.submitError.set('No product ID provided');
      return;
    }

    // Ensure we start on stage 1 (Details)
    this.currentStage.set(1);
    this.productId.set(productId);
    await this.loadProduct(productId);
  }

  /**
   * Load product data
   */
  private async loadProduct(productId: string): Promise<void> {
    this.isLoading.set(true);
    // Ensure we stay on stage 1 after loading
    this.currentStage.set(1);
    try {
      const product = await this.productService.getProductById(productId);
      if (!product) {
        this.submitError.set('Product not found');
        return;
      }

      // Populate form
      this.productForm.patchValue({
        name: product.name,
      });

      // Load product assets
      if (product.assets && product.assets.length > 0) {
        const assets: ProductAsset[] = product.assets.map((asset: any) => ({
          id: asset.id,
          name: asset.name,
          preview: asset.preview,
          source: asset.source || asset.preview,
        }));
        this.productAssets.set(assets);
      }

      // Load variants as SKUs
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant: any) => {
          // Convert price from cents to decimal
          const priceDecimal = variant.priceWithTax / 100;
          // Convert wholesalePrice from cents to decimal (if exists)
          const wholesalePriceDecimal = variant.customFields?.wholesalePrice
            ? variant.customFields.wholesalePrice / 100
            : null;

          const skuGroup = this.fb.group({
            id: [variant.id], // Store variant ID for updates
            name: [variant.name, [Validators.required, Validators.minLength(1)]],
            sku: [variant.sku], // Read-only, stored for display
            price: [priceDecimal, [Validators.required, Validators.min(0.01)]],
            wholesalePrice: [wholesalePriceDecimal, [Validators.min(0)]],
            stockOnHand: [variant.stockOnHand || 0], // Read-only
          });

          this.skus.push(skuGroup);
        });
      }
      // Ensure we stay on stage 1 after loading completes
      this.currentStage.set(1);
    } catch (error: any) {
      console.error('Failed to load product:', error);
      this.submitError.set('Failed to load product data');
    } finally {
      this.isLoading.set(false);
      // Final guarantee - stay on stage 1
      this.currentStage.set(1);
    }
  }

  /**
   * Add a new SKU
   */
  addSku(): void {
    const skuGroup = this.fb.group({
      id: [null], // No ID = new SKU
      name: ['', [Validators.required, Validators.minLength(1)]],
      sku: ['AUTO'], // Auto-generated
      price: [0, [Validators.required, Validators.min(0.01)]],
      wholesalePrice: [null, [Validators.min(0)]],
      stockOnHand: [0], // Locked to 0 for new SKUs
    });

    this.skus.push(skuGroup);
  }

  /**
   * Remove SKU at index
   */
  removeSku(index: number): void {
    if (this.skus.length > 1) {
      const sku = this.skus.at(index);
      const skuId = sku.get('id')?.value;

      if (skuId) {
        // TODO: Mark for deletion or handle variant deletion
        // For now, just remove from form
        console.warn('Deleting existing SKU:', skuId);
      }

      this.skus.removeAt(index);
    }
  }

  /**
   * Submit form - updates product and variants
   */
  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.productForm.markAllAsTouched();
      this.markFormArrayTouched(this.skus);
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(false);

    try {
      const formValue = this.productForm.value;
      const productId = this.productId();

      if (!productId) {
        this.submitError.set('Product ID missing');
        return;
      }

      const trimmedName = formValue.name.trim();

      // Variant updates (prices in decimal units, not cents)
      const variantUpdates = formValue.skus.map((sku: any) => ({
        id: sku.id,
        name: sku.name.trim(),
        price: Number(sku.price),
        wholesalePrice: sku.wholesalePrice ? Number(sku.wholesalePrice) : null,
      }));

      const ok = await this.productService.updateProductWithVariants(
        productId,
        trimmedName,
        variantUpdates,
      );

      if (ok) {
        this.submitSuccess.set(true);
        setTimeout(() => {
          this.router.navigate(['/dashboard/products']);
        }, 1500);
      } else {
        const errorMsg = this.productService.error();
        this.submitError.set(errorMsg || 'Failed to update product');
      }
    } catch (error: any) {
      console.error('Product update failed:', error);
      this.submitError.set(error.message || 'An unexpected error occurred');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Cancel and go back
   */
  cancel(): void {
    this.router.navigate(['/dashboard/products']);
  }

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
    if (errors['min']) return `Min value: ${errors['min'].min}`;

    return 'Invalid';
  }

  /**
   * Show photo edit unlock modal
   */
  showPhotoEditUnlock(): void {
    this.showUnlockModal.set(true);
  }

  /**
   * Handle photo edit unlock confirmation
   */
  onPhotoEditUnlocked(): void {
    this.showUnlockModal.set(false);
    this.showPhotoEditor.set(true);
  }

  /**
   * Handle photo edit unlock cancellation
   */
  onPhotoEditCancelled(): void {
    this.showUnlockModal.set(false);
  }

  /**
   * Handle photo changes from photo editor
   */
  async onPhotosChanged(event: { newPhotos: File[]; removedAssetIds: string[] }): Promise<void> {
    const productId = this.productId();
    if (!productId) {
      this.submitError.set('Product ID missing');
      return;
    }

    this.isUpdatingPhotos.set(true);
    try {
      const success = await this.productService.updateProductAssets(
        productId,
        event.newPhotos,
        event.removedAssetIds,
      );

      if (success) {
        // Reload product to get updated assets
        await this.loadProduct(productId);
        this.showPhotoEditor.set(false);
        this.submitSuccess.set(true);

        // Clear success message after a delay
        setTimeout(() => {
          this.submitSuccess.set(false);
        }, 3000);
      } else {
        this.submitError.set('Failed to update photos');
      }
    } catch (error: any) {
      console.error('Photo update failed:', error);
      this.submitError.set('Failed to update photos');
    } finally {
      this.isUpdatingPhotos.set(false);
      // Reset photo editor saving state
      this.photoEditor()?.resetSavingState();
    }
  }

  /**
   * Close photo editor
   */
  closePhotoEditor(): void {
    this.showPhotoEditor.set(false);
  }
}
