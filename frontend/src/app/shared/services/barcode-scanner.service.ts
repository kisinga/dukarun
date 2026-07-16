import { Injectable, inject, signal } from '@angular/core';
import { TracingService } from './tracing.service';

/**
 * Barcode detection result
 */
export interface BarcodeResult {
  rawValue: string;
  format: string;
  boundingBox?: DOMRectReadOnly;
}

/**
 * Options for barcode scanning
 */
export interface ScanOptions {
  timeoutMs?: number; // Auto-stop after duration (default: 30000)
  pauseOnHidden?: boolean; // Pause when tab hidden (default: true)
}

/**
 * Service for barcode scanning using BarcodeDetector API
 * Falls back to manual search if API is not available
 */
@Injectable({
  providedIn: 'root',
})
export class BarcodeScannerService {
  private readonly tracingService = inject(TracingService, { optional: true });
  private detector: any = null; // BarcodeDetector type not in TypeScript by default
  private readonly isSupportedSignal = signal<boolean>(false);
  private readonly isScanningSignal = signal<boolean>(false);
  private scanInterval: any = null;
  private frameCallbackId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private isPaused = false;
  private currentSpan: any = null; // Span for current scanning session

  readonly isSupported = this.isSupportedSignal.asReadonly();
  readonly isScanning = this.isScanningSignal.asReadonly();

  /**
   * Get diagnostic information about BarcodeDetector support
   * Useful for debugging support issues
   */
  getDiagnostics(): {
    isSecureContext: boolean;
    hasBarcodeDetector: boolean;
    isSupported: boolean;
    userAgent: string;
  } {
    return {
      isSecureContext: window.isSecureContext,
      // @ts-ignore
      hasBarcodeDetector: 'BarcodeDetector' in window,
      isSupported: this.isSupportedSignal(),
      userAgent: navigator.userAgent,
    };
  }

  constructor() {
    this.checkSupport();
  }

  /**
   * Check if BarcodeDetector API is supported
   */
  private async checkSupport(): Promise<void> {
    const span = this.tracingService?.startSpan('barcode.detector.check_support', {
      'barcode.check.secure_context': window.isSecureContext.toString(),
    });

    // Check if we're in a secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext;
    if (!isSecureContext) {
      console.warn(
        'BarcodeDetector API requires a secure context (HTTPS or localhost). Current context is not secure.',
      );
      this.isSupportedSignal.set(false);
      if (span) {
        this.tracingService?.setAttributes(span, {
          'barcode.check.result': 'not_secure_context',
        });
        this.tracingService?.endSpan(span, false);
      }
      return;
    }

    // @ts-ignore - BarcodeDetector not in TypeScript lib
    const hasBarcodeDetector = 'BarcodeDetector' in window;
    if (span) {
      this.tracingService?.setAttributes(span, {
        'barcode.check.has_detector': hasBarcodeDetector.toString(),
      });
    }

    if (hasBarcodeDetector) {
      try {
        // @ts-ignore
        const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
        console.log('BarcodeDetector supported formats:', supportedFormats);
        if (supportedFormats && supportedFormats.length > 0) {
          this.isSupportedSignal.set(true);
          if (span) {
            this.tracingService?.setAttributes(span, {
              'barcode.check.result': 'supported',
              'barcode.check.format_count': supportedFormats.length,
              'barcode.check.formats': supportedFormats.join(','),
            });
            this.tracingService?.endSpan(span, true);
          }
        } else {
          console.warn('BarcodeDetector API available but no formats supported');
          this.isSupportedSignal.set(false);
          if (span) {
            this.tracingService?.setAttributes(span, {
              'barcode.check.result': 'no_formats',
            });
            this.tracingService?.endSpan(span, false);
          }
        }
      } catch (error) {
        console.warn('BarcodeDetector API check failed:', error);
        this.isSupportedSignal.set(false);
        if (span) {
          this.tracingService?.setAttributes(span, {
            'barcode.check.result': 'check_failed',
          });
          this.tracingService?.endSpan(span, false, error as Error);
        }
      }
    } else {
      console.log(
        'BarcodeDetector API not available in this browser. Requires Chrome 88+, Edge 88+, or Safari 16.4+',
      );
      this.isSupportedSignal.set(false);
      if (span) {
        this.tracingService?.setAttributes(span, {
          'barcode.check.result': 'not_available',
        });
        this.tracingService?.endSpan(span, false);
      }
    }
  }

  /**
   * Initialize barcode detector
   */
  async initialize(): Promise<boolean> {
    if (!this.isSupportedSignal()) {
      console.log('BarcodeDetector not supported, skipping initialization');
      return false;
    }

    try {
      // @ts-ignore
      this.detector = new window.BarcodeDetector({
        formats: [
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'code_128',
          'code_39',
          'code_93',
          'qr_code',
          'data_matrix',
        ],
      });
      console.log('BarcodeDetector initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize BarcodeDetector:', error);
      return false;
    }
  }

  /**
   * Start continuous barcode scanning on video stream
   * Uses frame-synchronized detection for better performance and battery efficiency
   */
  startScanning(
    videoElement: HTMLVideoElement,
    onDetect: (result: BarcodeResult) => void,
    options?: ScanOptions,
  ): void {
    if (!this.detector) {
      console.warn('Cannot start scanning: detector not initialized');
      return;
    }

    if (this.isScanningSignal()) {
      console.log('Already scanning');
      return;
    }

    // Start telemetry span for scanning session
    const span = this.tracingService?.startSpan('barcode.scan.start', {
      'barcode.scan.timeout_ms': options?.timeoutMs ?? 30000,
      'barcode.scan.pause_on_hidden': (options?.pauseOnHidden ?? true).toString(),
      'barcode.scan.video_width': videoElement.videoWidth || 0,
      'barcode.scan.video_height': videoElement.videoHeight || 0,
    });
    this.currentSpan = span || null;

    this.isScanningSignal.set(true);
    this.isPaused = false;

    const timeoutMs = options?.timeoutMs ?? 30000;
    const pauseOnHidden = options?.pauseOnHidden ?? true;

    // Set up timeout
    if (timeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        console.log('Barcode scan timed out');
        if (this.currentSpan) {
          this.tracingService?.addEvent(this.currentSpan, 'barcode.scan.timeout', {
            'barcode.scan.timeout_duration_ms': timeoutMs,
          });
        }
        this.stopScanning();
      }, timeoutMs);
    }

    // Set up visibility change handler
    if (pauseOnHidden) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.isPaused = true;
          if (this.currentSpan) {
            this.tracingService?.addEvent(this.currentSpan, 'barcode.scan.paused', {
              'barcode.scan.reason': 'visibility_hidden',
            });
          }
        } else {
          this.isPaused = false;
          if (this.currentSpan) {
            this.tracingService?.addEvent(this.currentSpan, 'barcode.scan.resumed', {
              'barcode.scan.reason': 'visibility_visible',
            });
          }
          // Resume scanning when visible again
          this.scheduleNextFrame(videoElement, onDetect);
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Start frame-synchronized scanning
    this.scheduleNextFrame(videoElement, onDetect);

    console.log('Barcode scanning started');
  }

  /**
   * Schedule next frame detection using requestVideoFrameCallback or requestAnimationFrame
   */
  private scheduleNextFrame(
    videoElement: HTMLVideoElement,
    onDetect: (result: BarcodeResult) => void,
  ): void {
    if (!this.isScanningSignal() || this.isPaused) {
      return;
    }

    // Use requestVideoFrameCallback if available (more efficient, frame-synchronized)
    if ('requestVideoFrameCallback' in videoElement) {
      this.frameCallbackId = (videoElement as any).requestVideoFrameCallback(() => {
        this.performDetection(videoElement, onDetect);
      });
    } else {
      // Fallback to requestAnimationFrame
      this.frameCallbackId = requestAnimationFrame(() => {
        this.performDetection(videoElement, onDetect);
      }) as any;
    }
  }

  /**
   * Perform barcode detection on current video frame
   */
  private async performDetection(
    videoElement: HTMLVideoElement,
    onDetect: (result: BarcodeResult) => void,
  ): Promise<void> {
    if (!this.isScanningSignal() || this.isPaused) {
      return;
    }

    // Check if video is ready
    if (!videoElement.videoWidth || videoElement.paused || videoElement.ended) {
      this.scheduleNextFrame(videoElement, onDetect);
      return;
    }

    try {
      const barcodes = await this.detector.detect(videoElement);

      if (barcodes && barcodes.length > 0) {
        const barcode = barcodes[0];
        const result: BarcodeResult = {
          rawValue: barcode.rawValue,
          format: barcode.format,
          boundingBox: barcode.boundingBox,
        };

        console.log('Barcode detected:', result);

        // Log successful detection to telemetry
        if (this.currentSpan) {
          this.tracingService?.addEvent(this.currentSpan, 'barcode.detected', {
            'barcode.format': result.format,
            'barcode.value_length': result.rawValue.length,
            'barcode.has_bounding_box': (result.boundingBox !== undefined).toString(),
          });
          this.tracingService?.setAttributes(this.currentSpan, {
            'barcode.scan.result': 'success',
            'barcode.scan.format': result.format,
          });
        }

        onDetect(result);

        // Stop scanning after detection
        this.stopScanning();
        return;
      }
    } catch (error) {
      console.error('Barcode detection error:', error);
      if (this.currentSpan) {
        this.tracingService?.addEvent(this.currentSpan, 'barcode.detection.error', {
          'barcode.error.message': (error as Error).message || 'Unknown error',
        });
      }
    }

    // Schedule next frame if still scanning
    if (this.isScanningSignal()) {
      this.scheduleNextFrame(videoElement, onDetect);
    }
  }

  /**
   * Stop barcode scanning
   */
  stopScanning(): void {
    // Clear interval (legacy fallback)
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Cancel frame callback
    if (this.frameCallbackId !== null) {
      if (typeof this.frameCallbackId === 'number') {
        cancelAnimationFrame(this.frameCallbackId);
      }
      this.frameCallbackId = null;
    }

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Remove visibility handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // End telemetry span
    const span = this.currentSpan;
    if (span) {
      if (!this.isScanningSignal()) {
        // If already stopped, mark as cancelled
        this.tracingService?.setAttributes(span, {
          'barcode.scan.result': 'cancelled',
        });
      } else {
        // If stopping normally, check if we have a result
        this.tracingService?.setAttributes(span, {
          'barcode.scan.result': 'stopped',
        });
      }
      this.tracingService?.endSpan(span, true);
      this.currentSpan = null;
    }

    this.isPaused = false;
    this.isScanningSignal.set(false);
    console.log('Barcode scanning stopped');
  }

  /**
   * Single barcode detection on image
   */
  async detectOnce(
    imageSource: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  ): Promise<BarcodeResult | null> {
    if (!this.detector) {
      await this.initialize();
      if (!this.detector) {
        return null;
      }
    }

    try {
      const barcodes = await this.detector.detect(imageSource);
      if (barcodes && barcodes.length > 0) {
        const barcode = barcodes[0];
        return {
          rawValue: barcode.rawValue,
          format: barcode.format,
          boundingBox: barcode.boundingBox,
        };
      }
      return null;
    } catch (error) {
      console.error('Barcode detection error:', error);
      return null;
    }
  }
}
