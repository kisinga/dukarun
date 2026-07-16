import {
  Detector,
  DetectionCallback,
  DetectionCoordinatorOptions,
  DetectionResult,
} from './detection.types';
import { BarcodeNotFoundError } from './barcode-detector';

/**
 * Detection Coordinator
 *
 * Manages multiple detectors (barcode, ML) and distributes video frames
 * between them using alternating (round-robin) strategy.
 *
 * Frame distribution:
 * - Frame 0 → Detector 0 (barcode)
 * - Frame 1 → Detector 1 (ML)
 * - Frame 2 → Detector 0 (barcode)
 * - ...
 *
 * If current detector is busy (still processing), skip to next available detector.
 * First successful detection wins and stops all detection.
 */
export class DetectionCoordinator {
  private detectors: Detector[] = [];
  private currentDetectorIndex = 0;
  private running = false;
  private frameCallbackId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private isPaused = false;
  private lastFrameTime = 0;

  private onDetection: DetectionCallback | null = null;
  private onTimeout: (() => void) | null = null;
  private onBarcodeNotFound: ((barcode: string) => void) | null = null;
  private options: DetectionCoordinatorOptions;

  constructor(options: DetectionCoordinatorOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 30000,
      pauseOnHidden: options.pauseOnHidden ?? true,
      minFrameIntervalMs: options.minFrameIntervalMs ?? 100, // Minimum 100ms between frames
    };
  }

  /**
   * Register a detector with the coordinator
   */
  registerDetector(detector: Detector): void {
    this.detectors.push(detector);
    console.log(`[DetectionCoordinator] Registered detector: ${detector.name}`);
  }

  /**
   * Initialize all registered detectors
   * Returns true if at least one detector initialized successfully
   */
  async initializeDetectors(): Promise<boolean> {
    if (this.detectors.length === 0) {
      console.warn('[DetectionCoordinator] No detectors registered');
      return false;
    }

    const results = await Promise.all(
      this.detectors.map(async (detector) => {
        try {
          const success = await detector.initialize();
          console.log(
            `[DetectionCoordinator] ${detector.name} initialization: ${success ? 'success' : 'failed'}`,
          );
          return success;
        } catch (error) {
          console.error(`[DetectionCoordinator] ${detector.name} initialization error:`, error);
          return false;
        }
      }),
    );

    const anySuccess = results.some((r) => r);

    if (anySuccess) {
      const readyDetectors = this.detectors.filter((d) => d.isReady()).map((d) => d.name);
      console.log(`[DetectionCoordinator] Ready detectors: ${readyDetectors.join(', ')}`);
    } else {
      console.warn('[DetectionCoordinator] No detectors initialized successfully');
    }

    return anySuccess;
  }

  /**
   * Start detection loop
   */
  start(
    video: HTMLVideoElement,
    onDetection: DetectionCallback,
    onTimeout?: () => void,
    onBarcodeNotFound?: (barcode: string) => void,
  ): void {
    if (this.running) {
      console.warn('[DetectionCoordinator] Already running');
      return;
    }

    const readyDetectors = this.detectors.filter((d) => d.isReady());
    if (readyDetectors.length === 0) {
      console.warn('[DetectionCoordinator] No ready detectors, cannot start');
      return;
    }

    this.running = true;
    this.isPaused = false;
    this.onDetection = onDetection;
    this.onTimeout = onTimeout || null;
    this.onBarcodeNotFound = onBarcodeNotFound || null;
    this.currentDetectorIndex = 0;
    this.lastFrameTime = 0;

    console.log(
      `[DetectionCoordinator] Starting with ${readyDetectors.length} detector(s): ${readyDetectors.map((d) => d.name).join(', ')}`,
    );

    // Set up timeout
    if (this.options.timeoutMs && this.options.timeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        console.log('[DetectionCoordinator] Timeout reached');
        this.stop();
        // Notify parent component about timeout
        if (this.onTimeout) {
          this.onTimeout();
        }
      }, this.options.timeoutMs);
    }

    // Set up visibility handler
    if (this.options.pauseOnHidden) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.isPaused = true;
          console.log('[DetectionCoordinator] Paused (tab hidden)');
        } else {
          this.isPaused = false;
          console.log('[DetectionCoordinator] Resumed (tab visible)');
          this.scheduleNextFrame(video);
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Add initial delay to ensure video stream is ready before processing frames
    // This matches the pattern from product-create where camera starts before scanning begins
    setTimeout(() => {
      if (this.running) {
        // Start frame loop after delay
        this.scheduleNextFrame(video);
      }
    }, 250);
  }

  /**
   * Stop detection loop and cleanup
   */
  stop(): void {
    this.running = false;
    this.isPaused = false;

    // Cancel frame callback
    if (this.frameCallbackId !== null) {
      cancelAnimationFrame(this.frameCallbackId);
      this.frameCallbackId = null;
    }

    // Clear timeout
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Remove visibility handler
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.onDetection = null;
    this.onTimeout = null;
    console.log('[DetectionCoordinator] Stopped');
  }

  /**
   * Cleanup all detectors and coordinator
   */
  cleanup(): void {
    this.stop();

    for (const detector of this.detectors) {
      try {
        detector.cleanup();
      } catch (error) {
        console.error(`[DetectionCoordinator] Error cleaning up ${detector.name}:`, error);
      }
    }

    this.detectors = [];
    console.log('[DetectionCoordinator] Cleaned up');
  }

  /**
   * Check if coordinator is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get list of ready detector names
   */
  getReadyDetectors(): string[] {
    return this.detectors.filter((d) => d.isReady()).map((d) => d.name);
  }

  /**
   * Schedule next frame processing
   */
  private scheduleNextFrame(video: HTMLVideoElement): void {
    if (!this.running || this.isPaused) {
      return;
    }

    // Use requestVideoFrameCallback if available (more efficient, frame-synchronized)
    if ('requestVideoFrameCallback' in video) {
      this.frameCallbackId = (video as any).requestVideoFrameCallback(() => {
        this.processFrame(video);
      });
    } else {
      // Fallback to requestAnimationFrame
      this.frameCallbackId = requestAnimationFrame(() => {
        this.processFrame(video);
      });
    }
  }

  /**
   * Process a single frame - alternating between detectors
   */
  private async processFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.running || this.isPaused) {
      return;
    }

    // Throttle frame processing
    const now = performance.now();
    if (now - this.lastFrameTime < (this.options.minFrameIntervalMs ?? 100)) {
      this.scheduleNextFrame(video);
      return;
    }
    this.lastFrameTime = now;

    // Enhanced video readiness checks
    // Check if video has enough data loaded (HAVE_CURRENT_DATA = 2)
    if (video.readyState < 2) {
      this.scheduleNextFrame(video);
      return;
    }

    // Check if video has a source stream
    if (!video.srcObject) {
      this.scheduleNextFrame(video);
      return;
    }

    // Check if video has valid dimensions
    if (
      !video.videoWidth ||
      !video.videoHeight ||
      video.videoWidth < 64 ||
      video.videoHeight < 64
    ) {
      this.scheduleNextFrame(video);
      return;
    }

    // Check if video is playing
    if (video.paused || video.ended) {
      this.scheduleNextFrame(video);
      return;
    }

    // Get ready detectors
    const readyDetectors = this.detectors.filter((d) => d.isReady());
    if (readyDetectors.length === 0) {
      this.scheduleNextFrame(video);
      return;
    }

    // Find next available (non-processing) detector using round-robin
    let detector: Detector | null = null;
    let attempts = 0;

    while (attempts < readyDetectors.length) {
      const candidateIndex = this.currentDetectorIndex % readyDetectors.length;
      const candidate = readyDetectors[candidateIndex];

      // Move to next detector for next frame (alternating)
      this.currentDetectorIndex++;

      if (!candidate.isProcessing()) {
        detector = candidate;
        break;
      }

      attempts++;
    }

    // If all detectors are busy, skip this frame
    if (!detector) {
      this.scheduleNextFrame(video);
      return;
    }

    // Process frame with selected detector (fire and forget - don't await)
    this.processWithDetector(detector, video);

    // Schedule next frame immediately (don't wait for processing)
    this.scheduleNextFrame(video);
  }

  /**
   * Process a frame with a specific detector
   */
  private async processWithDetector(detector: Detector, video: HTMLVideoElement): Promise<void> {
    try {
      const result = await detector.processFrame(video);

      if (result && this.running) {
        // Detection found! Stop and emit
        console.log(`[DetectionCoordinator] Detection from ${detector.name}:`, result.product.name);
        this.handleDetection(result);
      }
    } catch (error: any) {
      // Check if this is a BarcodeNotFoundError
      if (error instanceof BarcodeNotFoundError && this.onBarcodeNotFound) {
        console.log(`[DetectionCoordinator] Barcode detected but not found: ${error.barcode}`);
        this.onBarcodeNotFound(error.barcode);
        // Don't stop detection - allow user to scan another barcode
      } else {
        console.error(`[DetectionCoordinator] Error in ${detector.name}:`, error);
      }
    }
  }

  /**
   * Handle successful detection
   */
  private handleDetection(result: DetectionResult): void {
    // Save callback reference before stopping (stop() clears it)
    const callback = this.onDetection;

    // Emit result first, before stopping
    if (callback) {
      callback(result);
    }

    // Stop detection loop after callback is called
    this.stop();
  }
}
