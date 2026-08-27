import { Component, computed, input, output, signal } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { imageExtension, resizeImage } from '../shared/ui/image.util';

export interface PendingProductImage {
  blob: Blob;
  extension: string;
  previewUrl: string;
}

/**
 * Product photo UI boundary.
 *
 * This child owns browser-only work: camera/gallery inputs, client-side resize, preview URL
 * creation, and retry/remove button intents. ProductsComponent remains the source of truth for
 * catalog persistence because create/edit saves, image upload, previous-image cleanup, and product
 * refresh need to stay in the product editor workflow.
 */
@Component({
  selector: 'app-product-photo-control',
  imports: [ButtonComponent, IconComponent],
  template: `
    <section class="mt-5 border-t border-base-300 pt-4">
      <div>
        <h3 class="section-title">Product photo</h3>
        <p id="product-photo-help" class="type-caption mt-0.5">
          A clear, well-lit photo makes the product easier to find while selling.
        </p>
      </div>

      <div
        class="mt-3 rounded-box border border-base-300 bg-base-200/40 p-3 sm:flex sm:items-center sm:gap-4"
      >
        <div
          class="mx-auto flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-box border border-base-300 bg-base-100 sm:mx-0 sm:h-28 sm:w-28"
        >
          @if (previewUrl(); as preview) {
            <img
              [src]="preview"
              [alt]="alt()"
              class="h-full w-full object-cover"
              (error)="imageBroken.emit()"
            />
          } @else {
            <div class="px-3 text-center text-base-content/45">
              <app-icon name="heroCamera" size="xl" />
              <p class="mt-1 text-xs">No photo yet</p>
            </div>
          }
        </div>

        <div class="mt-3 min-w-0 flex-1 sm:mt-0">
          <input
            #productCameraInput
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            aria-describedby="product-photo-help"
            [disabled]="actionDisabled()"
            (change)="selectPhoto($event)"
          />
          <input
            #productPhotoInput
            type="file"
            accept="image/*"
            class="hidden"
            aria-describedby="product-photo-help"
            [disabled]="actionDisabled()"
            (change)="selectPhoto($event)"
          />

          <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              appButton
              type="button"
              variant="soft"
              class="w-full sm:w-auto"
              [disabled]="actionDisabled()"
              (click)="productCameraInput.click()"
            >
              <app-icon name="heroCamera" />
              Take photo
            </button>
            <button
              appButton
              type="button"
              variant="outline"
              class="w-full sm:w-auto"
              [disabled]="actionDisabled()"
              (click)="productPhotoInput.click()"
            >
              <app-icon name="heroArrowUpTray" />
              Choose photo
            </button>
          </div>

          @if (pending() && mode() === 'edit' && !controlBusy()) {
            <button
              appButton
              type="button"
              variant="outline"
              class="mt-2 w-full sm:w-auto"
              (click)="retryUpload.emit()"
            >
              Retry upload
            </button>
          }

          @if (previewUrl()) {
            <button
              appButton
              type="button"
              variant="ghost"
              class="mt-2 w-full text-error sm:w-auto"
              [disabled]="actionDisabled()"
              (click)="removePhoto.emit()"
            >
              <app-icon name="heroXMark" />
              Remove photo
            </button>
          }

          <p class="type-caption mt-2" aria-live="polite">
            @if (controlBusy()) {
              {{ busyLabel() }}
            } @else if (pending() && mode() === 'create') {
              Ready - the photo will upload when you create the product.
            } @else if (pending()) {
              Upload paused. Check your connection and retry.
            } @else {
              Photos are resized for faster uploads. You can replace them anytime.
            }
          </p>
        </div>
      </div>
    </section>
  `,
})
export class ProductPhotoControlComponent {
  readonly previewUrl = input<string | null>(null);
  readonly alt = input('Product photo preview');
  readonly mode = input.required<'create' | 'edit'>();
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly pending = input(false);

  readonly imageSelected = output<PendingProductImage>();
  readonly selectionFailed = output<string>();
  readonly retryUpload = output<void>();
  readonly removePhoto = output<void>();
  readonly imageBroken = output<void>();

  protected readonly processing = signal(false);
  protected readonly controlBusy = computed(() => this.processing() || this.busy());
  protected readonly actionDisabled = computed(() => this.disabled() || this.controlBusy());

  protected busyLabel(): string {
    if (this.processing()) return 'Preparing photo...';
    return this.mode() === 'create' ? 'Preparing photo...' : 'Uploading photo...';
  }

  protected async selectPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.processing.set(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a valid image file.');
      const resized = await resizeImage(file, 800);
      this.imageSelected.emit({
        blob: resized,
        extension: imageExtension(resized),
        previewUrl: URL.createObjectURL(resized),
      });
    } catch (err) {
      this.selectionFailed.emit(err instanceof Error ? err.message : 'Could not use that photo');
    } finally {
      this.processing.set(false);
      input.value = '';
    }
  }
}
