// Embedder adapters: one interface, two backends.
// Each returns { name, dim, embed(image) -> Promise<Float32Array (L2-normalised)> }.
// `image` is { el: HTMLImageElement, url: string } so each backend uses what it needs.
//
// Loaded as zero-build ESM from esm.sh. Needs network on first run (model weights).

import { l2norm } from './match.js';

/**
 * MobileNet via TensorFlow.js — the default. Runs on the tfjs the app already ships.
 * Uses the penultimate layer as a feature embedding (infer(img, embedding=true)).
 */
export async function createMobileNetEmbedder(onProgress) {
  onProgress?.('MobileNet: loading tfjs + weights…');
  const tf = await import('https://esm.sh/@tensorflow/tfjs@4');
  const mobilenet = await import('https://esm.sh/@tensorflow-models/mobilenet@2?deps=@tensorflow/tfjs@4');
  // Try WebGL, fall back to CPU/WASM automatically via tfjs default backend.
  await tf.ready();
  const model = await mobilenet.load({ version: 2, alpha: 1.0 });

  let dim = 0;
  async function embed(image) {
    const t = model.infer(image.el, /* embedding */ true); // [1, dim]
    const data = await t.data();
    t.dispose();
    dim = data.length;
    return l2norm(Float32Array.from(data));
  }

  return { name: 'MobileNetV2 (tfjs)', get dim() { return dim; }, embed };
}

/**
 * MobileCLIP-S0 via Transformers.js (ONNX). Contrastively trained -> more robust to
 * lighting/clutter. Heavier (model + ONNX runtime). EXPERIMENTAL: if separability looks
 * wrong, try pooling: 'mean' vs 'cls', or dtype 'fp16', or device 'wasm'. See README.
 */
export async function createMobileClipEmbedder(onProgress) {
  onProgress?.('MobileCLIP: importing transformers.js…');
  // jsDelivr's +esm build resolves the ONNX/WASM runtime more reliably than esm.sh here.
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } =
    await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');
  onProgress?.('MobileCLIP: transformers.js loaded.');
  env.allowLocalModels = false;

  // First run downloads the model + the ONNX/WASM runtime and compiles it — slow once.
  const progress_callback = (p) => {
    if (!onProgress) return;
    if (p.status === 'progress' && p.file) {
      onProgress(`MobileCLIP ⬇ ${p.file}: ${Math.round(p.progress || 0)}%`);
    } else if (p.status) {
      onProgress(`MobileCLIP: ${p.status}${p.file ? ' ' + p.file : ''}…`);
    }
  };

  // Use the CLIP vision tower + projection head — `image_embeds` is the actual CLIP image
  // embedding (the space cosine retrieval lives in). NOT the pipeline's mean-pooled tokens.
  //
  // Device/dtype pairing matters and is hardware-dependent:
  //   WebGPU + int8  -> loads but returns near-constant garbage (int8 is a WASM optimisation)
  //   WebGPU + fp16  -> needs the shader-f16 GPU feature, often missing -> load fails
  //   WebGPU + fp32  -> correct, no special feature needed (bigger download)
  //   WASM   + int8  -> always correct, slower
  // Try fastest-correct first, fall back to always-correct WASM+int8.
  const MODEL_ID = 'Xenova/mobileclip_s0';
  const hasGpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  const configs = [
    ...(hasGpu ? [{ device: 'webgpu', dtype: 'fp32' }] : []), // fast + correct (45MB)
    { device: 'wasm', dtype: 'fp32' },                        // correct on CPU (slow). NB: int8 is
    //   broken for this model (garbage on both WebGPU and WASM), so fp32 is the only safe weight.
  ];
  const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
  let vision = null, used = null;
  for (const cfg of configs) {
    try {
      onProgress?.(`MobileCLIP: loading ${cfg.device}/${cfg.dtype}…`);
      vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
        dtype: cfg.dtype, device: cfg.device, progress_callback,
      });
      used = cfg;
      break;
    } catch (err) {
      onProgress?.(`MobileCLIP: ${cfg.device}/${cfg.dtype} failed (${err?.message || err}); falling back…`);
    }
  }
  if (!vision) throw new Error('all MobileCLIP device/dtype configs failed to load');
  onProgress?.(`MobileCLIP ready (${used.device}/${used.dtype}).`);

  let dim = 0;
  async function embed(image) {
    let imageEmbeds;
    try {
      const raw = await RawImage.read(image.url);
      const inputs = await processor(raw);
      const out = await vision(inputs);
      imageEmbeds = out.image_embeds;
    } catch (err) {
      throw new Error(`MobileCLIP embed failed (${err?.message || err}).`);
    }
    const data = imageEmbeds?.data;
    if (!data) throw new Error('MobileCLIP returned no image_embeds — check the model class.');
    dim = data.length;
    return l2norm(Float32Array.from(data));
  }

  return { name: `MobileCLIP-S0 ${used.dtype} (${used.device})`, get dim() { return dim; }, embed };
}

export const EMBEDDERS = {
  mobilenet: { label: 'MobileNetV2 (tfjs) — default, light', create: createMobileNetEmbedder },
  mobileclip: { label: 'MobileCLIP-S0 int8 — heavier, robust (experimental)', create: createMobileClipEmbedder },
};
