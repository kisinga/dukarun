import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
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
import { BackgroundStateService } from '../../../../core/services/background-state.service';
import { BarcodeScannerService } from '../../../../core/services/barcode-scanner.service';
import { CameraService } from '../../../../core/services/camera.service';
import { ProductSearchResult } from '../../../../core/services/product/product-search.service';
import { ProductSearchService } from '../../../../core/services/product/product-search.service';
import { ScannerBeepService } from '../../../../core/services/scanner-beep.service';
import { BarcodeDetector } from './detection/barcode-detector';
import { DetectionCoordinator } from './detection/detection-coordinator';
import { DetectionResult } from './detection/detection.types';
import { MLDetector } from './detection/ml-detector';

type ScannerStatus = 'idle' | 'initializing' | 'ready' | 'scanning' | 'error';

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
  imports: [CommonModule],
  template: `
    @if (isScanning()) {
      <div class="card bg-base-100 shadow-xl border-2 border-primary animate-in">
        <div class="card-body p-3">
          <!-- Scanner Header -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span class="font-semibold text-sm">Scanning...</span>
              @if (activeDetectors().length > 0) {
                <span class="text-xs text-base-content/70"
                  >({{ activeDetectors().join(', ') }})</span
                >
              }
            </div>
            <button class="btn btn-sm btn-error" (click)="stopScanner()">Stop</button>
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

            <!-- Scan Frame -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div class="scan-frame"></div>
            </div>
          </div>

          <!-- Status Footer -->
          <div class="text-center text-xs text-base-content/70 mt-2">
            Point camera at product or barcode
          </div>

          <!-- Barcode Not Found Feedback -->
          @if (barcodeNotFoundMessage()) {
            <div class="alert alert-warning mt-2 animate-in">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
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
    }
  `,
  styles: `
    .scan-frame {
      width: 80%;
      height: 60%;
      max-width: 300px;
      max-height: 300px;
      border: 3px solid oklch(var(--p));
      border-radius: 1rem;
      box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.5);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductScannerComponent implements OnInit, OnDestroy {
  // Inputs
  readonly channelId = input.required<string>();
  readonly confidenceThreshold = input<number>(0.9);
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
  private readonly injector = inject(Injector);
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
          this.injector,
          this.productSearchService,
          this.beepService,
          this.channelId(),
          this.confidenceThreshold(),
        );
        this.coordinator.registerDetector(mlDetector);
      }

      // Initialize all detectors
      const anyReady = await this.coordinator.initializeDetectors();

      if (!anyReady) {
        console.warn('[ProductScanner] No detectors initialized successfully');
        // Continue anyway - camera will still work, just no detection
      }

      this.activeDetectors.set(this.coordinator.getReadyDetectors());
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
