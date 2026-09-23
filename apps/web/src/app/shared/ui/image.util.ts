/**
 * Client-side image resize via canvas (max `maxPx` on the longest edge).
 * Keeps the upload small for thermal-printer-era connections. No deps.
 */
export async function resizeImage(file: File, maxPx = 800): Promise<Blob> {
  const declaredType = file.type.toLocaleLowerCase();
  const sourceType = declaredType.startsWith('image/')
    ? declaredType
    : imageTypeFromName(file.name);
  if (!sourceType) throw new Error('Choose a valid image file.');

  // Camera and filesystem providers sometimes omit Blob.type or use application/octet-stream.
  // Give the decoder the type inferred from the filename, then let decoding validate the bytes.
  const source = declaredType === sourceType ? file : new Blob([file], { type: sourceType });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error('Could not read this photo. Choose a JPEG, PNG, or WebP image.');
  }

  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (!sourceWidth || !sourceHeight) throw new Error('Choose a valid image file.');

    const scale = Math.min(1, maxPx / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const type = sourceType === 'image/png' ? 'image/png' : 'image/jpeg';
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Resize failed'))), type, 0.85)
    );
  } finally {
    bitmap.close();
  }
}

function imageTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLocaleLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    default:
      return '';
  }
}

/** File extension for the upload path (from MIME, defaulting to jpg). */
export function imageExtension(file: Blob): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}
