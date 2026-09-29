import { describe, expect, it } from 'vitest';
import { prepareDocumentQr } from './document-qr';
import { validQr } from '@dukarun/documents';
describe('document QR preparation', () => {
  it('uses the existing encoder and produces serializable printable module data', async () => {
    const qr = await prepareDocumentQr('https://example.test/amina');
    expect(validQr(qr)).toBe(true);
    expect(((qr.size + 8) * 3 * 25.4) / 203).toBeLessThan(44);
    expect(qr.bits.slice(0, 7)).toBe('1111111');
  });
  it('reports values too dense for the smallest supported paper', async () => {
    await expect(prepareDocumentQr('a'.repeat(5000))).rejects.toThrow('readable printed QR');
  });
});
