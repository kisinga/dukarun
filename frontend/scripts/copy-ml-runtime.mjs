// Copy the ONNX Runtime WASM files that Transformers.js needs into public/assets/ml/ort so the
// recognizer's WASM/WebGPU(jsep) backend works OFFLINE. Without this, Transformers.js fetches
// ort-wasm-*.wasm from the jsDelivr CDN at runtime (see EmbedderService: env.backends.onnx.wasm.wasmPaths).
//
// Runs automatically via the `prebuild` / `prestart` npm scripts. Idempotent.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ORT_FILES = ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs'];

// Workspace hoists deps to the repo-root node_modules; also support a local install.
const distCandidates = [
  join(process.cwd(), 'node_modules', '@huggingface', 'transformers', 'dist'),
  join(process.cwd(), '..', 'node_modules', '@huggingface', 'transformers', 'dist'),
];
const distDir = distCandidates.find((d) => existsSync(join(d, ORT_FILES[0])));

if (!distDir) {
  console.error(
    '[copy-ml-runtime] @huggingface/transformers dist not found. Run `npm install` first.',
  );
  process.exit(1);
}

const outDir = join(process.cwd(), 'public', 'assets', 'ml', 'ort');
mkdirSync(outDir, { recursive: true });

for (const file of ORT_FILES) {
  copyFileSync(join(distDir, file), join(outDir, file));
  console.log(`[copy-ml-runtime] ${file}`);
}
console.log('[copy-ml-runtime] ONNX Runtime ready at public/assets/ml/ort/');
