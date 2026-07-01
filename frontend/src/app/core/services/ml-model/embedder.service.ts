import { Injectable, signal } from '@angular/core';
import { EMBEDDING_DIM, l2norm } from './embedding-match';

/**
 * Embedder version stamped onto every fingerprint at enrollment. The recognizer ignores
 * fingerprints whose version != this constant, so swapping the model can never produce
 * confident-wrong matches across embedding spaces. FROZEN for the feature's life — bumping it
 * disables recognition channel-wide until products are re-enrolled.
 */
export const EMBEDDER_VERSION = 'mobileclip-s0-fp32-v1';

/** Hugging Face repo id for the MobileCLIP-S0 vision encoder (Transformers.js / ONNX). */
const MODEL_ID = 'Xenova/mobileclip_s0';

export type EmbedderState = 'idle' | 'loading' | 'ready' | 'error';

export interface EmbedderStatus {
  state: EmbedderState;
  /** Human-readable progress/error, e.g. for the first-load ("downloading model…") UI. */
  message: string;
  /** 0–100 for the currently-downloading file, when known. */
  progress?: number;
}

/**
 * Turns a camera/enrollment frame into a normalized MobileCLIP-S0 image embedding, entirely
 * on-device. A single DI singleton is shared by enrollment and inference so the two never drift
 * apart (same model, same preprocessing).
 *
 * Why fp32 only: int8 of this model is degenerate on both WebGPU and WASM, and fp16 needs the
 * shader-f16 GPU feature (often missing). fp32 is the only weight that is correct everywhere — on
 * WebGPU (fast) with a WASM/CPU fallback (correct, slower). The 45 MB download is one-time and
 * cached. See docs/ML_PRODUCT_RECOGNITION.md §7.
 */
@Injectable({ providedIn: 'root' })
export class EmbedderService {
  /** Cached-promise init (mirrors ml-model.loader): parallel first-frames dedupe; the race is closed. */
  private initPromise: Promise<void> | null = null;

  // Lazily-loaded Transformers.js handles (kept untyped — the package is dynamically imported to
  // stay out of the main bundle, and we only touch a tiny, stable surface).
  private processor: any = null;
  private vision: any = null;
  private RawImage: any = null;
  private backend = '';

  /** First-load / error status for the UI to react to (45 MB download, offline failure, …). */
  readonly status = signal<EmbedderStatus>({ state: 'idle', message: '' });

  /** The embedder version fingerprints produced by this service are stamped with. */
  get version(): string {
    return EMBEDDER_VERSION;
  }

  /** Which compute backend won the load ('webgpu' | 'wasm'), for diagnostics. */
  get device(): string {
    return this.backend;
  }

  isReady(): boolean {
    return this.vision != null;
  }

  /** Idempotent: starts (or joins) loading the model. Safe to call eagerly to warm the cache. */
  async initialize(): Promise<void> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  /**
   * Embed one frame drawn onto a canvas → an L2-normalized 512-d vector. Both enrollment and
   * scanning go through this exact path (canvas in), guaranteeing identical preprocessing.
   * Throws on failure; callers choose the policy (abstain while scanning, surface while enrolling).
   */
  async embed(source: HTMLCanvasElement): Promise<number[]> {
    await this.initialize();
    return this.embedReady(source);
  }

  private async load(): Promise<void> {
    try {
      this.status.set({ state: 'loading', message: 'Loading recognition model…' });

      // Ask for persistent storage before pulling ~45 MB, so the model cache survives eviction.
      void this.requestPersistentStorage();

      const transformers: any = await import('@huggingface/transformers');
      const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = transformers;
      this.RawImage = RawImage;

      // Prefer locally-bundled model/runtime (offline), fall back to the HF hub when not bundled
      // (dev / first run before assets are placed). Production bundles them under public/assets/ml
      // and the service worker caches them — see docs + ngsw-config.json.
      env.allowLocalModels = true;
      env.localModelPath = '/assets/ml/';
      env.allowRemoteModels = true;

      // Serve the ONNX Runtime WASM from a bundled local path. Without this, v3.8.1 fetches
      // ort-wasm-*.wasm from the jsDelivr CDN at runtime — which breaks the offline WASM/WebGPU
      // fallback this service is built around. The two ORT files are copied into public/assets/ml/ort
      // by scripts/copy-ml-runtime.mjs (prebuild/prestart). numThreads=1 keeps the CPU fallback
      // reliable without requiring cross-origin isolation (COOP/COEP) for SharedArrayBuffer.
      env.backends.onnx.wasm.wasmPaths = '/assets/ml/ort/';
      env.backends.onnx.wasm.numThreads = 1;

      const progress_callback = (p: any) => {
        if (!p) return;
        if (p.status === 'progress' && p.file) {
          this.status.set({
            state: 'loading',
            message: `Downloading recognition model… (${p.file})`,
            progress: Math.round(p.progress ?? 0),
          });
        } else if (p.status) {
          this.status.set({ state: 'loading', message: `Recognition model: ${p.status}…` });
        }
      };

      // fp32 on WebGPU (fast) → fp32 on WASM (correct, slower). int8/fp16 are unusable for this
      // model (int8 = garbage on both backends; fp16 needs shader-f16). One weight, every device.
      const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      const configs = [
        ...(hasGpu ? [{ device: 'webgpu', dtype: 'fp32' }] : []),
        { device: 'wasm', dtype: 'fp32' },
      ];

      this.processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });

      let lastError: unknown = null;
      for (const cfg of configs) {
        try {
          this.vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
            dtype: cfg.dtype,
            device: cfg.device,
            progress_callback,
          });
          this.backend = cfg.device;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!this.vision) {
        throw new Error(
          `recognition model failed to load on all backends: ${this.errMsg(lastError)}`,
        );
      }

      await this.warmup();
      this.status.set({ state: 'ready', message: '' });
    } catch (err) {
      this.status.set({ state: 'error', message: this.errMsg(err) });
      this.initPromise = null; // allow a later retry (e.g. once back online)
      throw err;
    }
  }

  /** Core embed with no init guard (used by warmup and, post-init, by embed()). */
  private async embedReady(source: HTMLCanvasElement): Promise<number[]> {
    if (!this.vision || !this.processor) {
      throw new Error('embedder not initialized');
    }
    const { width, height } = source;
    if (!width || !height) throw new Error('embed: source canvas has zero size');

    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('embed: 2d context unavailable');
    const imageData = ctx.getImageData(0, 0, width, height);

    // Canvas pixels are RGBA; .rgb() drops alpha. The model's own AutoProcessor then handles the
    // resize + CLIP normalization, so enrollment and scanning share identical preprocessing.
    const image = new this.RawImage(imageData.data, width, height, 4).rgb();
    const inputs = await this.processor(image);
    const output = await this.vision(inputs);
    const data = output?.image_embeds?.data as Float32Array | undefined;
    if (!data || data.length !== EMBEDDING_DIM) {
      this.disposeTensors(inputs, output);
      throw new Error(`embed: unexpected output (len=${data?.length ?? 'none'})`);
    }
    // Copy the embedding out BEFORE disposing (reading .data already did the WebGPU readback).
    const result = l2norm(Array.from(data));
    this.disposeTensors(inputs, output);
    return result;
  }

  /** Free per-frame input/output tensors (ORT doesn't auto-dispose them — avoids a scan-loop leak). */
  private disposeTensors(...bags: any[]): void {
    for (const bag of bags) {
      if (!bag) continue;
      for (const tensor of Object.values(bag)) {
        try {
          (tensor as any)?.dispose?.();
        } catch {
          // best-effort
        }
      }
    }
  }

  /** Run one throwaway embed so the ONNX graph compiles now, not on the first real scan frame. */
  private async warmup(): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      await this.embedReady(canvas);
    } catch {
      // Warmup is best-effort; a failure here doesn't block readiness.
    }
  }

  private async requestPersistentStorage(): Promise<void> {
    try {
      const storage = navigator?.storage;
      if (storage?.persist && !(await storage.persisted())) {
        await storage.persist();
      }
    } catch {
      // Best-effort; eviction just means a re-download on next cold start.
    }
  }

  private errMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    return typeof err === 'string' ? err : 'unknown error';
  }
}
