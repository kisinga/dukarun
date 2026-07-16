/**
 * Shared ROI preprocessing for on-device recognition.
 *
 * Enrollment and scanning MUST crop the frame identically, or the embeddings they produce won't
 * live in the same space (the enroll↔scan parity requirement). This is the single place that crop
 * is defined — both paths call it, so they can never drift apart.
 */

/** Side length of the square ROI fed to the embedder (also the on-screen "aim box" proportion). */
export const ROI_SIZE = 256;

/** Create a square ROI canvas sized for the embedder (willReadFrequently → fast getImageData). */
export function createRoiCanvas(size = ROI_SIZE): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, ctx };
}

/**
 * Draw the centered square region of a source (video / image / canvas) into a square output canvas.
 * `sourceWidth`/`sourceHeight` are the source's intrinsic dimensions (e.g. `video.videoWidth`,
 * `image.naturalWidth`). The embedder's own processor handles the final resize + normalization.
 */
export function drawCenteredRoi(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size = ROI_SIZE,
): void {
  const side = Math.min(sourceWidth, sourceHeight);
  const sx = (sourceWidth - side) / 2;
  const sy = (sourceHeight - side) / 2;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
}
