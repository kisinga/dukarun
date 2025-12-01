import { BarcodeScannerService } from '../../../../../core/services/barcode-scanner.service';
import { ProductSearchService } from '../../../../../core/services/product/product-search.service';
import { ScannerBeepService } from '../../../../../core/services/scanner-beep.service';
import { Detector, DetectionResult } from './detection.types';

/**
 * Barcode detector implementing the Detector interface.
 * Uses BarcodeScannerService for single-frame barcode detection
 * and ProductSearchService for product lookup.
 */
export class BarcodeDetector implements Detector {
  readonly name = 'barcode';

  private ready = false;
  private processing = false;
  
  // Debouncing: Track recently detected barcodes to prevent duplicate processing
  private readonly recentBarcodes = new Map<string, number>(); // barcode -> timestamp
  private readonly debounceMs = 2000; // Ignore same barcode for 2 seconds

  constructor(
    private readonly barcodeService: BarcodeScannerService,
    private readonly productSearchService: ProductSearchService,
    private readonly beepService: ScannerBeepService,
  ) {}

  async initialize(): Promise<boolean> {
    try {
      // Check if barcode detection is supported
      if (!this.barcodeService.isSupported()) {
        console.log('[BarcodeDetector] BarcodeDetector API not supported');
        this.ready = false;
        return false;
      }

      // Initialize the barcode detector
      const initialized = await this.barcodeService.initialize();
      this.ready = initialized;

      if (initialized) {
        console.log('[BarcodeDetector] Initialized successfully');
      } else {
        console.warn('[BarcodeDetector] Failed to initialize - barcodeService.initialize() returned false');
      }

      return initialized;
    } catch (error) {
      console.error('[BarcodeDetector] Initialization error:', error);
      this.ready = false;
      return false;
    }
  }

  async processFrame(video: HTMLVideoElement): Promise<DetectionResult | null> {
    if (!this.ready || this.processing) {
      return null;
    }

    // Enhanced video readiness checks
    // Check if video has enough data loaded (HAVE_CURRENT_DATA = 2)
    if (video.readyState < 2) {
      return null;
    }

    // Check if video has a source stream
    if (!video.srcObject) {
      return null;
    }

    // Check if video has valid dimensions
    if (!video.videoWidth || !video.videoHeight || video.videoWidth < 64 || video.videoHeight < 64) {
      return null;
    }

    // Check if video is playing
    if (video.paused || video.ended) {
      return null;
    }

    this.processing = true;

    try {
      // Use single-frame detection
      const barcodeResult = await this.barcodeService.detectOnce(video);

      if (!barcodeResult) {
        return null;
      }

      const barcodeValue = barcodeResult.rawValue;
      const now = Date.now();
      
      // Debounce: Check if this barcode was recently detected
      const lastDetected = this.recentBarcodes.get(barcodeValue);
      if (lastDetected && now - lastDetected < this.debounceMs) {
        // Same barcode detected within debounce window - ignore
        return null;
      }
      
      // Record this detection timestamp
      this.recentBarcodes.set(barcodeValue, now);
      
      // Clean up old entries (older than debounce window) to prevent memory leak
      for (const [barcode, timestamp] of this.recentBarcodes.entries()) {
        if (now - timestamp >= this.debounceMs) {
          this.recentBarcodes.delete(barcode);
        }
      }

      console.log('[BarcodeDetector] Barcode detected:', barcodeValue, 'format:', barcodeResult.format);

      // CRITICAL: Play beep immediately when barcode is detected (before DB lookup)
      // This provides immediate feedback that a barcode was scanned
      this.beepService.playBeep().catch((beepError) => {
        console.warn('[BarcodeDetector] Beep failed:', beepError);
      });

      // Look up product by barcode
      let variant;
      try {
        variant = await this.productSearchService.searchByBarcode(barcodeValue);
      } catch (searchError) {
        console.error('[BarcodeDetector] Error searching for barcode:', searchError);
        // Throw special error to notify coordinator that barcode was detected but search failed
        throw new BarcodeNotFoundError(barcodeValue);
      }

      if (!variant) {
        console.warn(`[BarcodeDetector] Barcode "${barcodeValue}" not found in system`);
        // Throw special error to notify coordinator that barcode was detected but not found
        throw new BarcodeNotFoundError(barcodeValue);
      }

      // Build detection result
      const result: DetectionResult = {
        type: 'barcode',
        product: {
          id: variant.productId,
          name: variant.productName,
          variants: [variant],
          featuredAsset: variant.featuredAsset,
        },
        rawValue: barcodeValue,
        confidence: 1.0, // Barcode detection is binary - found or not
      };

      console.log('[BarcodeDetector] Product found:', result.product.name);
      return result;
    } catch (error) {
      // Re-throw BarcodeNotFoundError so coordinator can handle it
      if (error instanceof BarcodeNotFoundError) {
        throw error;
      }
      console.error('[BarcodeDetector] Error processing frame:', error);
      return null;
    } finally {
      this.processing = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  cleanup(): void {
    this.ready = false;
    this.processing = false;
    this.recentBarcodes.clear(); // Clear debounce cache on cleanup
    // Note: We don't call barcodeService.stopScanning() here because
    // we're using detectOnce() which doesn't start continuous scanning
    console.log('[BarcodeDetector] Cleaned up');
  }
}

/**
 * Special error class for when barcode is detected but not found in database
 */
export class BarcodeNotFoundError extends Error {
  constructor(public readonly barcode: string) {
    super(`Barcode "${barcode}" not found in system`);
    this.name = 'BarcodeNotFoundError';
  }
}

