/**
 * TensorFlow.js module loader utility
 * Provides lazy loading of TensorFlow.js to reduce initial bundle size
 */

export type TfModule = typeof import('@tensorflow/tfjs');

let tfModule: TfModule | null = null;
let tfModulePromise: Promise<TfModule> | null = null;

/**
 * Get TensorFlow.js module with lazy loading
 * Caches the module after first load
 */
export async function getTf(): Promise<TfModule> {
  if (tfModule) {
    return tfModule;
  }

  tfModulePromise ??= import('@tensorflow/tfjs');
  tfModule = await tfModulePromise;
  return tfModule;
}
