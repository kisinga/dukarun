import { describe, expect, it } from '@jest/globals';
import { NotificationCalendarService } from '../../../src/services/notifications/notification-calendar.service';

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

const utcForEat = (isoEatLocal: string) => {
  const [datePart, timePart] = isoEatLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(ms - EAT_OFFSET_MS);
};

describe('NotificationCalendarService', () => {
  const calendar = new NotificationCalendarService();

  describe('isWhatsAppWindowOpen', () => {
    it('returns true at 08:00 EAT', () => {
      expect(calendar.isWhatsAppWindowOpen(utcForEat('2026-07-15T08:00:00'))).toBe(true);
    });

    it('returns false at 19:00 EAT', () => {
      expect(calendar.isWhatsAppWindowOpen(utcForEat('2026-07-15T19:00:00'))).toBe(false);
    });

    it('returns false at 07:00 EAT', () => {
      expect(calendar.isWhatsAppWindowOpen(utcForEat('2026-07-15T07:00:00'))).toBe(false);
    });
  });

  describe('nextWhatsAppFlushTime', () => {
    it('returns now inside the window', () => {
      const now = utcForEat('2026-07-15T10:00:00');
      expect(calendar.nextWhatsAppFlushTime(now).toISOString()).toBe(now.toISOString());
    });

    it('flushes at 08:00 EAT the next day when after the window', () => {
      const now = utcForEat('2026-07-15T21:00:00');
      const expected = utcForEat('2026-07-16T08:00:00');
      expect(calendar.nextWhatsAppFlushTime(now).toISOString()).toBe(expected.toISOString());
    });
  });

  describe('whatsAppWindowDescription', () => {
    it('describes a closed window at 21:00 EAT', () => {
      const description = calendar.whatsAppWindowDescription(utcForEat('2026-07-15T21:00:00'));
      expect(description).toContain('closed');
      expect(description).toContain('current EAT hour 21');
    });

    it('describes an open window at 10:00 EAT', () => {
      const description = calendar.whatsAppWindowDescription(utcForEat('2026-07-15T10:00:00'));
      expect(description).toContain('open');
      expect(description).toContain('current EAT hour 10');
    });
  });
});
