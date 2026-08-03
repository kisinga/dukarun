import { ProductSearchService } from '@dukarun/product';
import { ScannerBeepService } from '../../../../shared/services/scanner-beep.service';
import { EmbedderService } from '../../../../shared/services/ml-model/embedder.service';
import {
  ProductCandidate,
  Threshold,
  accepts,
  bestMatch,
  buildCandidates,
  calibrateTau,
} from '../../../../shared/services/ml-model/embedding-match';
import { createRoiCanvas, drawCenteredRoi } from '../../../../shared/services/ml-model/frame-roi';
import { Detector, DetectionResult } from './detection.types';

/**
 * Minimum enrolled products before ML recognition arms. 1 is enough: with a single candidate there
 * is no top1/top2 margin, so the matcher falls back to the absolute cosine threshold (tau), which
 * bestMatch/calibrateTau already handle safely (margin := score; tau floored conservatively).
 */
const MIN_ENROLLED_PRODUCTS = 1;

/**
 * ML detector: recognizes a product by embedding the centered region of the camera frame and
 * matching it (nearest-neighbour, cosine) against the channel's enrolled fingerprints — entirely
 * on-device, offline. Implements the same `Detector` seam as before; only the body changed.
 *
 * Composition: EmbedderService (frame → embedding) + embedding-match (pure matcher) +
 * ProductSearchService (candidates + product lookup) + ScannerBeepService. It owns no ML itself.
 *
 * Safety: abstains (returns null → coordinator keeps scanning, barcode/manual stay live) unless a
 * match clears the calibrated absolute threshold AND the top1/top2 margin. Never recognizes a
 * disabled product. Never blocks the barcode path while the model is still loading.
 */
export class MLDetector implements Detector {
  readonly name = 'ml';

  private ready = false;
  private processing = false;
  private candidates: ProductCandidate[] = [];
  private gate: Threshold = { tau: 1, margin: 1 };

  // One reused canvas for the ROI crop — never allocate per frame.
  private readonly roi = createRoiCanvas();

  constructor(
    private readonly embedder: EmbedderService,
    private readonly productSearchService: ProductSearchService,
    private readonly beepService: ScannerBeepService,
  ) {}

  async initialize(): Promise<boolean> {
    // Build the candidate set from the offline cache (already channel-scoped), filtered to this
    // embedder version. No network, no model download here — just data.
    this.candidates = buildCandidates(
      this.productSearchService.getRecognitionCandidates(this.embedder.version),
    );

    if (this.candidates.length < MIN_ENROLLED_PRODUCTS) {
      console.log(
        `[MLDetector] ${this.candidates.length} enrolled product(s) (< ${MIN_ENROLLED_PRODUCTS}); ML off, barcode only`,
      );
      this.ready = false;
      return false;
    }

    this.gate = calibrateTau(this.candidates);

    // Warm the embedder (the 45 MB model load) in the background so the first scan frame doesn't
    // pay the cold-start cost. processFrame abstains until it's ready, so barcode covers the gap.
    void this.embedder.initialize().catch(() => {
      // Surfaced via embedder.status for the UI; scanning simply falls back to barcode.
    });

    this.ready = true;
    console.log(
      `[MLDetector] Armed: ${this.candidates.length} products, tau=${this.gate.tau.toFixed(2)}, margin=${this.gate.margin}`,
    );
    return true;
  }

  async processFrame(video: HTMLVideoElement): Promise<DetectionResult | null> {
    if (!this.ready || this.processing) return null;
    if (!this.embedder.isReady()) return null; // model still loading — let barcode handle frames
    if (!this.roi.ctx) return null;
    if (
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight ||
      video.paused ||
      video.ended
    ) {
      return null;
    }

    this.processing = true;
    try {
      drawCenteredRoi(this.roi.ctx, video, video.videoWidth, video.videoHeight);
      const embedding = await this.embedder.embed(this.roi.canvas);

      const match = bestMatch(embedding, this.candidates); // centroid mode (default)
      if (!accepts(match, this.gate)) {
        return null; // unsure → abstain → fall back to barcode/manual
      }

      const product = await this.productSearchService.getProductById(match.productId!);
      if (!product || product.enabled === false) {
        // Disabled/archived products keep their fingerprint but must never be recognized.
        return null;
      }

      this.beepService.playBeep().catch(() => {
        // Beep is best-effort feedback.
      });

      return { type: 'ml', product, confidence: match.score };
    } catch (error) {
      console.error('[MLDetector] processFrame error:', error);
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
    this.candidates = [];
  }
}
