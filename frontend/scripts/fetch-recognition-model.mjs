// Download the MobileCLIP-S0 vision model into public/assets/ml so the recognizer works fully
// OFFLINE (no Hugging Face hub fetch at runtime). Optional: without it, EmbedderService falls
// back to loading the model from the HF hub on first use (allowRemoteModels=true), which needs
// network on first run. Run for offline / production:  npm run ml:fetch-model
//
// Only the three files the vision-only embedder requests are downloaded (no text encoder /
// tokenizer). See the ONNX expert notes in archive/docs/2026-07-10/ML_PRODUCT_RECOGNITION_IMPLEMENTATION.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = 'Xenova/mobileclip_s0';
const BASE = `https://huggingface.co/${REPO}/resolve/main`;
const FILES = ['config.json', 'preprocessor_config.json', 'onnx/vision_model.onnx'];

const outRoot = join(process.cwd(), 'public', 'assets', 'ml', REPO);

for (const file of FILES) {
  const url = `${BASE}/${file}`;
  const dest = join(outRoot, file);
  mkdirSync(dirname(dest), { recursive: true });
  process.stdout.write(`[fetch-model] ${file} … `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED (${res.status} ${res.statusText})`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}

console.log(`[fetch-model] model ready under public/assets/ml/${REPO}/ (offline-capable)`);
