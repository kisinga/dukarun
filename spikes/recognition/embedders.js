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
export async function createMobileNetEmbedder() {
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
export async function createMobileClipEmbedder() {
  const { pipeline, env } = await import('https://esm.sh/@huggingface/transformers@3');
  env.allowLocalModels = false;
  const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
  const extractor = await pipeline('image-feature-extraction', 'Xenova/mobileclip_s0', {
    dtype: 'q8', // int8 — smallest. Switch to 'fp16' if accuracy is short.
    device,
  });

  let dim = 0;
  async function embed(image) {
    // Transformers.js takes a URL/RawImage, not an HTMLImageElement.
    const out = await extractor(image.url, { pooling: 'mean', normalize: true });
    const data = out.data || out.ort_tensor?.data;
    dim = data.length;
    return l2norm(Float32Array.from(data));
  }

  return { name: `MobileCLIP-S0 int8 (${device})`, get dim() { return dim; }, embed };
}

export const EMBEDDERS = {
  mobilenet: { label: 'MobileNetV2 (tfjs) — default, light', create: createMobileNetEmbedder },
  mobileclip: { label: 'MobileCLIP-S0 int8 — heavier, robust (experimental)', create: createMobileClipEmbedder },
};
