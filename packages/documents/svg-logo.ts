/** Shared upload/Edge policy. This module has no PDF, WASM or browser dependencies. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 2_000_000;

function embeddedPixels(bytes: Uint8Array, type: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47)
    return view.getUint32(16) * view.getUint32(20);
  if (type === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        marker &&
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)
      ) {
        if (length < 8) break;
        return view.getUint16(offset + 3) * view.getUint16(offset + 5);
      }
      offset += length;
    }
  }
  throw new Error('unsupported_svg_logo');
}

function attributeValue(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
      const point = code[0]!.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      if (point > 0x10ffff) throw new Error('unsupported_svg_logo');
      return String.fromCodePoint(point);
    })
    .replace(/&amp;/g, '&')
    .trim();
}

/** Allow local filters and embedded PNG/JPEG images, never external resources or nested SVGs. */
export function validateSvgLogo(text: string): void {
  if (
    text.length > MAX_LOGO_BYTES ||
    !/<svg[\s>]/i.test(text) ||
    /<!DOCTYPE|<!ENTITY|<script|<foreignObject|@import/i.test(text) ||
    (text.match(/<fe[a-z]+\b/gi)?.length ?? 0) > 128 ||
    (text.match(/<(?:image|feImage)\b/gi)?.length ?? 0) > 16
  )
    throw new Error('unsupported_svg_logo');
  let pixels = 0;
  for (const match of text.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gs)) {
    const href = attributeValue(match[2]!);
    if (href.startsWith('#')) continue;
    const data = /^data:image\/(png|jpeg);base64,([a-z0-9+/=\s]+)$/i.exec(href);
    if (!data) throw new Error('unsupported_svg_logo');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data[2]!.replace(/\s/g, '')), c => c.charCodeAt(0));
    } catch {
      throw new Error('unsupported_svg_logo');
    }
    const count = embeddedPixels(bytes, data[1]!.toLowerCase());
    if (!count || count > MAX_PIXELS || (pixels += count) > MAX_PIXELS)
      throw new Error('logo_pixel_limit');
  }
  for (const match of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi))
    if (!attributeValue(match[2]!).startsWith('#')) throw new Error('unsupported_svg_logo');
}
