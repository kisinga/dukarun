import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { BarcodeScannerComponent } from './barcode-scanner.component';
import { PhotoManagerComponent } from './photo-manager.component';

/** Identification method: barcode or label photos. */
export type IdentificationMethodType = 'barcode' | 'label-photos';

/**
 * Identification Selector Component
 *
 * Tabbed interface for barcode or photo identification.
 */
@Component({
  selector: 'app-identification-selector',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgIcon,
    PhotoManagerComponent,
    BarcodeScannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="tabs tabs-lift w-full [--tab-bg:var(--color-base-300)] lg:bg-base-200 lg:p-1 lg:rounded-xl"
    >
      <!-- Barcode tab -->
      <label
        class="tab flex-1 gap-2 font-medium min-w-0"
        [class.tab-active]="identificationMethod() === 'barcode'"
        [class.text-primary]="identificationMethod() === 'barcode'"
      >
        <input
          type="radio"
          name="identification_tabs"
          class="hidden"
          [checked]="identificationMethod() === 'barcode'"
          (change)="onMethodChange('barcode')"
        />
        <ng-icon name="heroQrCode" size="1rem" class="shrink-0" />
        <span class="truncate">Barcode</span>
        @if (barcodeControl().value) {
          <span class="badge badge-xs badge-success">
            <ng-icon name="heroCheck" size="0.875rem" />
          </span>
        }
      </label>
      <div class="tab-content bg-base-100 border-base-300 p-3 min-h-[100px]">
        @if (identificationMethod() === 'barcode') {
          <div class="space-y-3">
            @if (isScannerActive()) {
              <app-barcode-scanner
                #barcodeScanner
                [compact]="true"
                (barcodeScanned)="onBarcodeScanned($event)"
                (scanningStateChange)="onScanningStateChange($event)"
              />
            } @else {
              <!-- Input + scan button using join -->
              <div class="join w-full">
                <input
                  type="text"
                  [formControl]="barcodeControl()"
                  placeholder="Enter or scan barcode"
                  class="input input-bordered join-item flex-1"
                />
                <button
                  type="button"
                  class="btn btn-square btn-outline join-item"
                  (click)="startBarcodeScanner()"
                  title="Scan with camera"
                >
                  <ng-icon name="heroCamera" size="1.25rem" />
                </button>
              </div>
              @if (
                barcodeControl().invalid && (barcodeControl().dirty || barcodeControl().touched)
              ) {
                <div class="alert alert-error py-2">
                  <ng-icon name="heroExclamationCircle" size="1rem" />
                  <div class="text-xs">
                    @if (barcodeControl().errors?.['barcodeExists']) {
                      <div>{{ barcodeControl().errors!['barcodeExists'].message }}</div>
                    } @else {
                      <div>Invalid barcode</div>
                    }
                  </div>
                </div>
              } @else if (barcodeControl().value && barcodeControl().valid) {
                <div class="alert alert-success py-2">
                  <ng-icon name="heroCheckCircle" size="1rem" />
                  <span class="text-sm">Barcode ready</span>
                </div>
              } @else {
                <p class="text-xs text-center opacity-60">
                  Scan product barcode or type it manually
                </p>
              }
            }
          </div>
        } @else if (identificationMethod() !== 'label-photos') {
          <div class="flex items-center justify-center h-16">
            <p class="text-sm text-base-content/40">Enter or scan a barcode</p>
          </div>
        }
      </div>

      <!-- Photos tab -->
      <label
        class="tab flex-1 gap-2 font-medium min-w-0"
        [class.tab-active]="identificationMethod() === 'label-photos'"
        [class.text-primary]="identificationMethod() === 'label-photos'"
      >
        <input
          type="radio"
          name="identification_tabs"
          class="hidden"
          [checked]="identificationMethod() === 'label-photos'"
          (change)="onMethodChange('label-photos')"
        />
        <ng-icon name="heroPhoto" size="1rem" class="shrink-0" />
        <span class="truncate">Photos</span>
        @if (photoCount() >= 5) {
          <span class="badge badge-xs badge-success">
            <ng-icon name="heroCheck" size="0.875rem" />
          </span>
        } @else if (photoCount() > 0) {
          <span class="badge badge-xs badge-primary">{{ photoCount() }}</span>
        }
      </label>
      <div class="tab-content bg-base-100 border-base-300 p-3 min-h-[100px]">
        @if (identificationMethod() === 'label-photos') {
          <div class="space-y-3">
            <app-photo-manager #photoManager (photosChanged)="onPhotosChanged($event)" />
            @if (photoCount() >= 5) {
              <div class="alert alert-success py-2">
                <ng-icon name="heroCheckCircle" size="1rem" />
                <span class="text-sm">{{ photoCount() }} photos ready</span>
              </div>
            } @else {
              <p class="text-xs text-center opacity-60">
                Take {{ 5 - photoCount() }} more photo{{ 5 - photoCount() > 1 ? 's' : '' }} of the
                product label
              </p>
            }
          </div>
        } @else if (identificationMethod() !== 'barcode') {
          <div class="flex items-center justify-center h-16">
            <p class="text-sm text-base-content/40">Take photos of the product label</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class IdentificationSelectorComponent {
  // View references
  readonly barcodeScanner = viewChild<BarcodeScannerComponent>('barcodeScanner');

  // Inputs
  readonly identificationMethod = input.required<IdentificationMethodType | null>();
  readonly barcodeControl = input.required<FormControl>();
  readonly photoCount = input.required<number>();

  // Outputs
  readonly methodChange = output<IdentificationMethodType>();
  readonly barcodeScanned = output<string>();
  readonly photosChanged = output<File[]>();

  // Internal state
  readonly isScannerActive = signal(false);

  /**
   * Handle identification method change
   */
  onMethodChange(method: IdentificationMethodType): void {
    // Stop scanner if switching away from barcode
    if (method !== 'barcode' && this.isScannerActive()) {
      this.stopScanner();
    }
    this.methodChange.emit(method);
  }

  /**
   * Handle barcode scanned
   */
  onBarcodeScanned(barcode: string): void {
    this.barcodeScanned.emit(barcode);
    // Scanner will stop itself, but ensure state is updated
    this.isScannerActive.set(false);
  }

  /**
   * Handle photos changed
   */
  onPhotosChanged(photos: File[]): void {
    this.photosChanged.emit(photos);
  }

  /**
   * Handle scanner state change
   */
  onScanningStateChange(isScanning: boolean): void {
    this.isScannerActive.set(isScanning);
  }

  /**
   * Start barcode scanner
   */
  async startBarcodeScanner(): Promise<void> {
    // Ensure barcode method is selected
    if (this.identificationMethod() !== 'barcode') {
      this.onMethodChange('barcode');
      // Wait for view to update
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Set scanner active first so component renders
    this.isScannerActive.set(true);

    // Wait for component to be rendered in DOM
    await new Promise((resolve) => setTimeout(resolve, 50));

    const scanner = this.barcodeScanner();
    if (scanner) {
      await scanner.startScanning();
    } else {
      console.error('Barcode scanner component not found');
      this.isScannerActive.set(false);
    }
  }

  /**
   * Stop scanner
   */
  stopScanner(): void {
    const scanner = this.barcodeScanner();
    if (scanner) {
      scanner.stopScanning();
    }
    this.isScannerActive.set(false);
  }
}
