import {
  getNextWhatsAppFlushTime,
  isWithinWhatsAppWindow,
} from '../../../src/services/notifications/whatsapp-quiet-hours.util';

describe('WhatsApp quiet hours', () => {
  // EAT = UTC+3. Helpers build a UTC Date that corresponds to the given EAT time.
  const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
  const utcForEat = (isoEatLocal: string) => {
    // isoEatLocal like "2026-07-15T08:00:00" is interpreted as 08:00 EAT.
    // We build a UTC Date explicitly to avoid local-time ambiguity in tests.
    const [datePart, timePart] = isoEatLocal.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second = 0] = timePart.split(':').map(Number);
    const ms = Date.UTC(year, month - 1, day, hour, minute, second);
    return new Date(ms - EAT_OFFSET_MS);
  };

  describe('isWithinWhatsAppWindow', () => {
    it('returns true at 08:00 EAT', () => {
      expect(isWithinWhatsAppWindow(utcForEat('2026-07-15T08:00:00'))).toBe(true);
    });

    it('returns true at 18:59 EAT', () => {
      expect(isWithinWhatsAppWindow(utcForEat('2026-07-15T18:59:00'))).toBe(true);
    });

    it('returns false at 19:00 EAT', () => {
      expect(isWithinWhatsAppWindow(utcForEat('2026-07-15T19:00:00'))).toBe(false);
    });

    it('returns false at 07:00 EAT', () => {
      expect(isWithinWhatsAppWindow(utcForEat('2026-07-15T07:00:00'))).toBe(false);
    });

    it('returns false at 23:00 EAT', () => {
      expect(isWithinWhatsAppWindow(utcForEat('2026-07-15T23:00:00'))).toBe(false);
    });
  });

  describe('getNextWhatsAppFlushTime', () => {
    it('returns the same instant when already inside the window', () => {
      const now = utcForEat('2026-07-15T10:00:00'); // 07:00 UTC
      expect(getNextWhatsAppFlushTime(now).toISOString()).toBe(now.toISOString());
    });

    it('flushes at 08:00 EAT the same day when before the window', () => {
      const now = utcForEat('2026-07-15T05:00:00'); // 02:00 UTC
      const expected = utcForEat('2026-07-15T08:00:00'); // 05:00 UTC
      expect(getNextWhatsAppFlushTime(now).toISOString()).toBe(expected.toISOString());
    });

    it('flushes at 08:00 EAT the next day when after the window', () => {
      const now = utcForEat('2026-07-15T21:00:00'); // 18:00 UTC
      const expected = utcForEat('2026-07-16T08:00:00'); // 05:00 UTC next day
      expect(getNextWhatsAppFlushTime(now).toISOString()).toBe(expected.toISOString());
    });

    it('handles the boundary at exactly 19:00 EAT', () => {
      const now = utcForEat('2026-07-15T19:00:00'); // 16:00 UTC
      const expected = utcForEat('2026-07-16T08:00:00'); // 05:00 UTC next day
      expect(getNextWhatsAppFlushTime(now).toISOString()).toBe(expected.toISOString());
    });
  });
});
