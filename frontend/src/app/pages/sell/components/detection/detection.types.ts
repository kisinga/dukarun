import { ProductSearchResult } from '@dukarun/product';

/**
 * Result from any detector (barcode or ML)
 */
export interface DetectionResult {
  /** Type of detection that produced this result */
  type: 'barcode' | 'ml';
  /** The found product */
  product: ProductSearchResult;
  /** Confidence score (0-1), primarily for ML detection */
  confidence?: number;
  /** Raw barcode value, for barcode detection */
  rawValue?: string;
}

/**
 * Common interface for all detectors (barcode, ML, future detectors)
 */
export interface Detector {
  /** Human-readable name for logging/debugging */
  readonly name: string;

  /**
   * Initialize the detector (load models, check API support, etc.)
   * @returns true if initialization succeeded and detector is ready
   */
  initialize(): Promise<boolean>;

  /**
   * Process a single video frame for detection
   * @param video The video element to process
   * @returns DetectionResult if something was detected, null otherwise
   */
  processFrame(video: HTMLVideoElement): Promise<DetectionResult | null>;

  /**
   * Check if the detector is ready to process frames
   */
  isReady(): boolean;

  /**
   * Check if the detector is currently processing a frame
   * Used by coordinator to skip busy detectors
   */
  isProcessing(): boolean;

  /**
   * Clean up resources (stop scanning, unload models, etc.)
   */
  cleanup(): void;
}

/**
 * Callback for when detection finds a product
 */
export type DetectionCallback = (result: DetectionResult) => void;

/**
 * Options for detection coordinator
 */
export interface DetectionCoordinatorOptions {
  /** Timeout before auto-stopping detection (ms) */
  timeoutMs?: number;
  /** Pause detection when tab is hidden */
  pauseOnHidden?: boolean;
  /** Minimum interval between frame processing (ms) - throttle */
  minFrameIntervalMs?: number;
}

