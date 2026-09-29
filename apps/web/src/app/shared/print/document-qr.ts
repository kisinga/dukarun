import { validQr, type PreparedQr } from '@dukarun/documents';

/** Reuses the same local encoder as BarcodeLabelPrintService. Never sends QR content to a server. */
export async function prepareDocumentQr(value: string): Promise<PreparedQr> {
  const bwip = (await import('bwip-js/browser')).default;
  try {
    const [encoded] = bwip.raw('qrcode', value, 'eclevel=M');
    if (!encoded || !('pixs' in encoded) || encoded.pixx !== encoded.pixy)
      throw new Error('Unsupported QR output');
    const qr = { size: encoded.pixx, bits: encoded.pixs.map(bit => (bit ? '1' : '0')).join('') };
    if (!validQr(qr)) throw new Error('QR is too dense');
    return qr;
  } catch {
    throw new Error(
      'This value cannot produce a readable printed QR code. Shorten it and try again.'
    );
  }
}
