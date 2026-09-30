import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js';
import webpWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';
import UPNG from '@pdf-lib/upng';
import regular from './fonts/NotoSans-Regular.ttf';
import type { PdfAssets } from './pdf';
import { MAX_LOGO_BYTES, validateSvgLogo } from './svg-logo';
let initialized: Promise<void> | undefined;
let webpInitialized: Promise<void> | undefined;

/** Decodes only the supplied logo. No remote images, filesystem fonts, or network access. */
export async function preparePdfLogo(bytes: Uint8Array): Promise<NonNullable<PdfAssets['logo']>> {
  if (bytes.length > MAX_LOGO_BYTES) throw new Error('logo_too_large');
  if (bytes[0] === 137 && bytes[1] === 80) return { bytes, type: 'png' };
  if (bytes[0] === 255 && bytes[1] === 216) return { bytes, type: 'jpg' };
  const text = new TextDecoder().decode(bytes);
  let svg: string;
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const format = text.slice(12, 16);
    let width: number;
    let height: number;
    if (format === 'VP8X' && bytes.length >= 30) {
      if (bytes[20]! & 2) throw new Error('animated_logo_not_supported');
      width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    } else if (format === 'VP8L' && bytes.length >= 25) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (format === 'VP8 ' && bytes.length >= 30) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else throw new Error('invalid_webp_logo');
    if (!width || !height || width * height > 2_000_000) throw new Error('logo_pixel_limit');
    await (webpInitialized ??= WebAssembly.compile(webpWasm).then(module => initWebp(module)));
    const decoded = await decodeWebp(bytes.slice().buffer);
    if (decoded.width !== width || decoded.height !== height)
      throw new Error('invalid_webp_dimensions');
    return {
      bytes: new Uint8Array(UPNG.encode([decoded.data.buffer], width, height, 0)),
      type: 'png',
    };
  } else {
    validateSvgLogo(text);
    svg = text;
  }
  await (initialized ??= initWasm(wasm));
  const initial = new Resvg(svg, {
    font: { fontBuffers: [regular], defaultFontFamily: 'Noto Sans' },
  });
  let scale: number;
  try {
    // Resolve no external images, including references interpreted by the XML parser.
    if (initial.imagesToResolve().length) throw new Error('unsupported_svg_logo');
    scale = Math.min(1, 768 / Math.max(initial.width, initial.height));
  } finally {
    initial.free();
  }
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { fontBuffers: [regular], defaultFontFamily: 'Noto Sans' },
  });
  try {
    if (renderer.width * renderer.height > 2_000_000) throw new Error('logo_pixel_limit');
    const rendered = renderer.render();
    try {
      return { bytes: rendered.asPng(), type: 'png' };
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
