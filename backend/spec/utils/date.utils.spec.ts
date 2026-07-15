import { diffCalendarDays, endOfDay, startOfDay } from '../../src/utils/date.utils';

describe('date.utils', () => {
  describe('startOfDay', () => {
    it('strips the time component', () => {
      const result = startOfDay(new Date(2026, 6, 15, 18, 39, 7));
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('sets the time to the last millisecond of the day', () => {
      const result = endOfDay(new Date(2026, 6, 15, 18, 39, 7));
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });
  });

  describe('diffCalendarDays', () => {
    it('returns 0 for times on the same calendar day', () => {
      const start = new Date(2026, 6, 15, 0, 1);
      const end = new Date(2026, 6, 15, 23, 59);
      expect(diffCalendarDays(end, start)).toBe(0);
    });

    it('returns 1 for the next calendar day regardless of time', () => {
      const start = new Date(2026, 6, 15, 23, 0);
      const end = new Date(2026, 6, 16, 1, 0);
      expect(diffCalendarDays(end, start)).toBe(1);
    });

    it('returns the correct positive number across month boundaries', () => {
      const start = new Date(2026, 6, 30, 12, 0);
      const end = new Date(2026, 7, 2, 9, 0);
      expect(diffCalendarDays(end, start)).toBe(3);
    });
  });
});
