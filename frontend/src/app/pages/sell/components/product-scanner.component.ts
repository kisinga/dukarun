import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { BackgroundStateService } from '../../../shared/services/background-state.service';
import { BarcodeScannerService } from '../../../shared/services/barcode-scanner.service';
import { CameraService } from '../../../shared/services/camera.service';
import { ProductSearchResult, ProductSearchService } from '@dukarun/product';
import { ScannerBeepService } from '../../../shared/services/scanner-beep.service';
import { EmbedderService } from '../../../shared/services/ml-model/embedder.service';
import { BarcodeDetector } from './detection/barcode-detector';
import { DetectionCoordinator } from './detection/detection-coordinator';
import { DetectionResult } from './detection/detection.types';
import { MLDetector } from './detection/ml-detector';

type ScannerStatus = 'idle' | 'initializing' | 'ready' | 'scanning' | 'error' | 'unavailable';

/**
 * Product scanner component with dual detection (barcode + ML)
 *
 * Uses a modular architecture with:
 * - DetectionCoordinator: manages frame distribution between detectors
 * - BarcodeDetector: barcode scanning via BarcodeDetector API
 * - MLDetector: ML-based product recognition via TensorFlow.js
 *
 * Frame distribution is alternating (50/50) between barcode and ML detection.
 */
@Component({
  selector: 'app-product-scanner',
  imports: [CommonModule, NgIcon],
  template: `
    @if (isScanning()) {
      <div class="card bg-base-100 shadow-xl border-2 border-primary anim-fade-in">
        <div class="card-body p-3">
          <!-- Scanner Header -->
          <div class="flex items-center justify-between mb-2" role="status" aria-live="polite">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span class="font-semibold text-sm">Scanning...</span>
              @if (detectorLabels()) {
                <span class="text-xs text-base-content/70">({{ detectorLabels() }})</span>
              }
            </div>
            <button class="btn btn-error min-h-11 px-5" (click)="stopScanner()">Stop</button>
          </div>

          <!-- Camera View -->
          <div class="relative bg-black rounded-lg overflow-hidden" style="aspect-ratio: 4/3">
            <video
              #cameraView
              class="w-full h-full object-cover"
              autoplay
              playsinline
              muted
            ></video>

            <!-- Aim box: centered SQUARE matching the center-crop ROI the recognizer reads -->
            <div class="absolute inset-0 grid place-items-center pointer-events-none">
              <div class="relative aspect-square h-[88%] max-h-full">
                <div
                  class="absolute inset-0 rounded-2xl ring-2 ring-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                ></div>
                <span
                  class="absolute -top-px -left-px w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-2xl"
                ></span>
                <span
                  class="absolute -top-px -right-px w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-2xl"
                ></span>
                <span
                  class="absolute -bottom-px -left-px w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-2xl"
                ></span>
                <span
                  class="absolute -bottom-px -right-px w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-2xl"
                ></span>
                <span
                  class="absolute -bottom-7 inset-x-0 text-center text-[11px] text-white/90 drop-shadow"
                >
                  Frame the item here
                </span>
              </div>
            </div>

            <!-- Recognition model status (non-blocking; barcode keeps working throughout) -->
            @if (embedderStatus().state === 'loading') {
              <div
                class="absolute top-0 inset-x-0 bg-base-100/90 backdrop-blur-sm px-3 py-2 flex items-center gap-2 text-xs"
              >
                <span class="loading loading-spinner loading-xs text-primary"></span>
                <span class="flex-1 truncate">Preparing camera recognition…</span>
                @if (embedderStatus().progress != null) {
                  <span class="tabular-nums">{{ embedderStatus().progress }}%</span>
                }
              </div>
            } @else if (embedderStatus().state === 'error') {
              <div
                class="absolute top-0 inset-x-0 bg-warning/90 text-warning-content px-3 py-2 text-xs text-center"
              >
                Camera recognition unavailable — barcode still works
              </div>
            }
          </div>

          <!-- Status Footer -->
          <div class="text-center text-xs text-base-content/70 mt-2" aria-live="polite">
            @if (mlActive()) {
              Point the camera at a product or barcode
            } @else {
              Scan a barcode
            }
          </div>

          <!-- Barcode Not Found Feedback -->
          @if (barcodeNotFoundMessage()) {
            <div class="alert alert-warning mt-2 anim-fade-in-down">
              <ng-icon name="heroExclamationTriangle" size="1.25rem" />
              <div>
                <div class="font-semibold">Barcode Not Found</div>
                <div class="text-sm">
                  Barcode "{{ barcodeNotFoundMessage() }}" is not in the system
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    } @else {
      <!-- Non-scanning states: never leave the camera area blank (error / permission / idle) -->
      <div class="card bg-base-100 shadow-md border border-base-300">
        <div class="card-body items-center text-center gap-3 p-6">
          @if (scannerStatus() === 'error') {
            <ng-icon name="heroNoSymbol" size="2.25rem" class="text-error" />
            <p class="font-semibold">Camera unavailable</p>
            <p class="text-sm text-base-content/70">
              Allow camera access, or search the product by name below.
            </p>
            <button class="btn btn-primary min-h-12 px-6" (click)="toggleScanner()">
              Try again
            </button>
          } @else if (scannerStatus() === 'unavailable') {
            <ng-icon name="heroMagnifyingGlass" size="2.25rem" class="text-base-content/50" />
            <p class="font-semibold">Scanning not available here</p>
            <p class="text-sm text-base-content/70">
              This browser can't scan barcodes and no camera-recognition products are set up. Search
              for the product by name below.
            </p>
          } @else if (scannerStatus() === 'initializing') {
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="text-sm text-base-content/70">Starting camera…</p>
          } @else {
            <button class="btn btn-primary min-h-12 px-6 gap-2" (click)="toggleScanner()">
              <ng-icon name="heroCamera" size="1.25rem" /> Tap to scan
            </button>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductScannerComponent implements OnInit, OnDestroy {
  // Inputs
  readonly channelId = input.required<string>();
  readonly enableMLDetection = input<boolean>(true);
  readonly enableBarcodeScanning = input<boolean>(true);
  readonly autoStartOnMobile = input<boolean>(true);
  readonly detectionTimeoutMs = input<number>(30000);

  // Outputs
  readonly productDetected = output<ProductSearchResult>();
  readonly scannerReady = output<void>();
  readonly scannerError = output<string>();
  readonly scanningStateChange = output<boolean>();

  // Services
  private readonly embedderService = inject(EmbedderService);
  private readonly backgroundStateService = inject(BackgroundStateService);
  private readonly cameraService = inject(CameraService);
  private readonly barcodeService = inject(BarcodeScannerService);
  private readonly productSearchService = inject(ProductSearchService);
  private readonly beepService = inject(ScannerBeepService);

  // View references
  readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('cameraView');

  // State
  readonly scannerStatus = signal<ScannerStatus>('idle');
  readonly isScanning = signal<boolean>(false);
  readonly activeDetectors = signal<string[]>([]);
  readonly barcodeNotFoundMessage = signal<string | null>(null);

  /** Embedder load/download status, surfaced as a non-blocking banner (45MB one-time download). */
  readonly embedderStatus = this.embedderService.status;
  /** True once ML recognition is armed and active (≥3 enrolled products + model ready). */
  readonly mlActive = computed(() => this.activeDetectors().includes('ml'));
  /** Human-readable active-detector labels for the header (e.g. "Camera · Barcode"). */
  readonly detectorLabels = computed(() =>
    this.activeDetectors()
      .map((n) => (n === 'ml' ? 'Camera' : n === 'barcode' ? 'Barcode' : n))
      .join(' · '),
  );

  // Detection coordinator
  private coordinator: DetectionCoordinator | null = null;
  private cameraCleanup: (() => void) | null = null;

  readonly canStart = computed(() => {
    const status = this.scannerStatus();
    return status === 'idle' || status === 'ready' || status === 'error';
  });

  constructor() {
    // Watch background state and stop scanner when app goes to background
    // effect() must be called during injection context (constructor), not in lifecycle hooks
    effect(() => {
      const isBackground = this.backgroundStateService.isBackground();
      if (isBackground && this.isScanning()) {
        console.log('[ProductScanner] App went to background - stopping scanner');
        this.stopScanner();
      }
    });
  }

  ngOnInit(): void {
    this.initializeScanner();
  }

  ngOnDestroy(): void {
    // Ensure scanner is fully stopped and cleaned up
    this.stopScanner();
    this.coordinator?.cleanup();
    this.coordinator = null;

    // Double-check camera is stopped
    const videoEl = this.videoElement()?.nativeElement;
    if (videoEl) {
      this.cameraService.stopCamera(videoEl);
    }
  }

  /**
   * Initialize scanner - check camera, create coordinator and detectors
   */
  private async initializeScanner(): Promise<void> {
    this.scannerStatus.set('initializing');

    try {
      // Check camera availability
      const cameraAvailable = await this.cameraService.isCameraAvailable();
      if (!cameraAvailable) {
        const error = 'No camera found on this device';
        this.scannerStatus.set('error');
        this.scannerError.emit(error);
        return;
      }

      // Create coordinator
      this.coordinator = new DetectionCoordinator({
        timeoutMs: this.detectionTimeoutMs(),
        pauseOnHidden: true,
        minFrameIntervalMs: 100,
      });

      // Register barcode detector
      if (this.enableBarcodeScanning()) {
        const barcodeDetector = new BarcodeDetector(
          this.barcodeService,
          this.productSearchService,
          this.beepService,
        );
        this.coordinator.registerDetector(barcodeDetector);
      }

      // Register ML detector
      if (this.enableMLDetection()) {
        const mlDetector = new MLDetector(
          this.embedderService,
          this.productSearchService,
          this.beepService,
        );
        this.coordinator.registerDetector(mlDetector);
      }

      // Initialize all detectors
      await this.coordinator.initializeDetectors();
      this.activeDetectors.set(this.coordinator.getReadyDetectors());

      if (this.activeDetectors().length === 0) {
        // Nothing can scan here (e.g. a desktop browser without the BarcodeDetector API and no
        // enrolled products for ML). Surface it and steer to manual search rather than opening a
        // live-but-dead camera.
        console.warn('[ProductScanner] No detectors available — scanning disabled, use search');
        this.scannerStatus.set('unavailable');
        this.scannerReady.emit();
        return;
      }

      this.scannerStatus.set('ready');
      this.scannerReady.emit();

      // Auto-start on mobile
      if (this.autoStartOnMobile() && this.isMobileDevice()) {
        setTimeout(() => {
          this.startScanner().catch((err) => {
            console.warn('[ProductScanner] Auto-start failed (non-fatal):', err);
            this.scannerStatus.set('ready');
          });
        }, 500);
      }
    } catch (error: any) {
      console.error('[ProductScanner] Initialization failed:', error);
      this.scannerStatus.set('error');
      this.scannerError.emit(error.message);
    }
  }

  /**
   * Start the scanner - show camera and begin detection
   */
  async startScanner(): Promise<void> {
    if (!this.canStart()) {
      console.warn('[ProductScanner] Cannot start in current state:', this.scannerStatus());
      return;
    }

    // If recovering from error, reset state
    if (this.scannerStatus() === 'error') {
      this.scannerStatus.set('initializing');
    }

    // CRITICAL: Set isScanning FIRST so video element renders in DOM
    this.isScanning.set(true);
    this.scanningStateChange.emit(true);

    // Wait for video element with robust polling
    const videoEl = await this.waitForVideoElement();

    if (!videoEl) {
      const error = 'Camera view not ready. Please try again.';
      this.scannerStatus.set('error');
      this.scannerError.emit(error);
      this.isScanning.set(false);
      this.scanningStateChange.emit(false);
      throw new Error(error);
    }

    try {
      // Start camera
      this.cameraCleanup = await this.cameraService.startCamera(videoEl, {
        facingMode: 'environment',
        optimizeForMobile: true,
      });

      // Wait for video stream to be ready before starting detection
      // This ensures video has valid dimensions and readyState
      await this.waitForVideoReady(videoEl);

      this.scannerStatus.set('scanning');

      // Start detection coordinator (it has its own 250ms delay built-in)
      if (this.coordinator) {
        this.coordinator.start(
          videoEl,
          (result: DetectionResult) => {
            this.handleDetection(result);
          },
          () => {
            // Timeout callback - stop camera viewfinder
            console.log('[ProductScanner] Detection timeout - stopping camera');
            this.stopScanner();
          },
          (barcode: string) => {
            // Barcode detected but not found in database
            this.handleBarcodeNotFound(barcode);
          },
        );
        this.activeDetectors.set(this.coordinator.getReadyDetectors());
      }
    } catch (error: any) {
      console.error('[ProductScanner] Failed to start:', error);
      this.scannerStatus.set('error');
      this.scannerError.emit(error.message);
      this.isScanning.set(false);
      this.scanningStateChange.emit(false);
      throw error;
    }
  }

  /**
   * Stop the scanner
   */
  stopScanner(): void {
    console.log('[ProductScanner] stopScanner() called');

    // Stop coordinator
    this.coordinator?.stop();

    // Stop camera
    if (this.cameraCleanup) {
      this.cameraCleanup();
      this.cameraCleanup = null;
    } else {
      const videoEl = this.videoElement()?.nativeElement;
      if (videoEl) {
        this.cameraService.stopCamera(videoEl);
      }
    }

    // Clear barcode not found message
    this.barcodeNotFoundMessage.set(null);

    // Update state to hide viewfinder
    this.isScanning.set(false);
    this.scannerStatus.set('ready');
    this.scanningStateChange.emit(false);

    console.log(
      '[ProductScanner] Scanner stopped - isScanning:',
      this.isScanning(),
      'status:',
      this.scannerStatus(),
    );
  }

  /**
   * Toggle scanner on/off
   */
  toggleScanner(): void {
    if (this.isScanning()) {
      this.stopScanner();
    } else {
      this.startScanner().catch((err) => {
        console.error('[ProductScanner] Failed to start scanner:', err);
        this.scannerStatus.set('error');
        this.scannerError.emit(err.message || 'Failed to start scanner');
      });
    }
  }

  /**
   * Handle detection result from coordinator
   */
  private handleDetection(result: DetectionResult): void {
    console.log(`[ProductScanner] Detection from ${result.type}:`, result.product.name);

    try {
      // Clear any barcode not found message
      this.barcodeNotFoundMessage.set(null);

      // Stop scanner (this will hide the viewfinder)
      this.stopScanner();

      // Emit product to parent
      console.log(`[ProductScanner] Emitting productDetected event for:`, result.product.name);
      this.productDetected.emit(result.product);
      console.log(`[ProductScanner] ProductDetected event emitted successfully`);
    } catch (error) {
      console.error(`[ProductScanner] Error in handleDetection:`, error);
      // Even if there's an error, try to stop the scanner
      this.stopScanner();
    }
  }

  /**
   * Handle barcode detected but not found in database
   */
  private handleBarcodeNotFound(barcode: string): void {
    console.log(`[ProductScanner] Barcode "${barcode}" detected but not found in database`);
    this.barcodeNotFoundMessage.set(barcode);

    // Clear message after 3 seconds
    setTimeout(() => {
      this.barcodeNotFoundMessage.set(null);
    }, 3000);
  }

  /**
   * Wait for video element to be available in the DOM
   * Uses double-RAF pattern + polling for reliability
   */
  private async waitForVideoElement(): Promise<HTMLVideoElement | null> {
    // Wait for Angular change detection + DOM paint (double RAF ensures paint complete)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Poll for element with timeout
    const maxRetries = 10;
    const retryDelay = 50; // 50ms between retries
    let retries = 0;

    return new Promise<HTMLVideoElement | null>((resolve) => {
      const checkForElement = () => {
        const videoEl = this.videoElement()?.nativeElement;
        if (videoEl) {
          resolve(videoEl);
          return;
        }

        retries++;
        if (retries >= maxRetries) {
          console.warn(
            `[ProductScanner] Video element not found after ${maxRetries} retries (${maxRetries * retryDelay}ms)`,
          );
          resolve(null);
          return;
        }

        setTimeout(checkForElement, retryDelay);
      };

      checkForElement();
    });
  }

  /**
   * Wait for video element to have valid stream and dimensions
   * Ensures video is ready for frame processing
   */
  private async waitForVideoReady(videoEl: HTMLVideoElement): Promise<void> {
    const maxRetries = 20;
    const retryDelay = 50; // 50ms between retries
    let retries = 0;

    return new Promise<void>((resolve, reject) => {
      const checkReady = () => {
        // Check if video has enough data (HAVE_CURRENT_DATA = 2)
        const hasData = videoEl.readyState >= 2;
        // Check if video has source stream
        const hasStream = !!videoEl.srcObject;
        // Check if video has valid dimensions
        const hasDimensions = videoEl.videoWidth > 0 && videoEl.videoHeight > 0;

        if (hasData && hasStream && hasDimensions) {
          console.log(
            `[ProductScanner] Video ready: ${videoEl.videoWidth}x${videoEl.videoHeight}, readyState=${videoEl.readyState}`,
          );
          resolve();
          return;
        }

        retries++;
        if (retries >= maxRetries) {
          console.warn(
            `[ProductScanner] Video not ready after ${maxRetries} retries (${maxRetries * retryDelay}ms)`,
          );
          // Don't reject - continue anyway, coordinator will handle it
          resolve();
          return;
        }

        setTimeout(checkReady, retryDelay);
      };

      checkReady();
    });
  }

  /**
   * Check if running on mobile device
   */
  private isMobileDevice(): boolean {
    return navigator.maxTouchPoints > 0 && window.innerWidth < 768;
  }
}
