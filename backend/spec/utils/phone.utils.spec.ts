import {
  formatPhoneNumber,
  toInternationalFormat,
  validatePhoneNumber,
} from '../../src/utils/phone.utils';

describe('phone.utils', () => {
  describe('formatPhoneNumber', () => {
    it('should return the same number when already normalized (mobile)', () => {
      expect(formatPhoneNumber('0712345678')).toBe('0712345678');
    });

    it('should return the same number when already normalized (landline)', () => {
      expect(formatPhoneNumber('0201234567')).toBe('0201234567');
    });

    it('should normalize international format with plus prefix', () => {
      expect(formatPhoneNumber('+254712345678')).toBe('0712345678');
    });

    it('should normalize international format without plus prefix', () => {
      expect(formatPhoneNumber('254712345678')).toBe('0712345678');
    });

    it('should normalize landline international format', () => {
      expect(formatPhoneNumber('254201234567')).toBe('0201234567');
    });

    it('should normalize number missing leading zero (mobile)', () => {
      expect(formatPhoneNumber('712345678')).toBe('0712345678');
    });

    it('should accept landline numbers', () => {
      expect(formatPhoneNumber('0812345678')).toBe('0812345678');
    });

    it('should reject numbers with invalid length', () => {
      expect(() => formatPhoneNumber('07123456789')).toThrow(
        'Invalid phone number format. Expected 0XXXXXXXXX (10 digits starting with 0). Received: 07123456789'
      );
    });

    it('should reject 10 digits not starting with 0', () => {
      expect(() => formatPhoneNumber('1234567890')).toThrow(
        'Invalid phone number format. Expected 0XXXXXXXXX (10 digits starting with 0). Received: 1234567890'
      );
    });

    it('should reject empty phone numbers', () => {
      expect(() => formatPhoneNumber('')).toThrow('Phone number is required');
    });
  });

  describe('validatePhoneNumber', () => {
    it('should return true for normalized mobile numbers', () => {
      expect(validatePhoneNumber('0712345678')).toBe(true);
    });

    it('should return true for normalized landline numbers', () => {
      expect(validatePhoneNumber('0201234567')).toBe(true);
    });

    it('should return true for international numbers', () => {
      expect(validatePhoneNumber('+254712345678')).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(validatePhoneNumber('12345')).toBe(false);
    });
  });

  describe('toInternationalFormat', () => {
    it('should convert 07XXXXXXXX to 2547XXXXXXXX', () => {
      expect(toInternationalFormat('0712345678')).toBe('254712345678');
    });

    it('should throw for landline numbers', () => {
      expect(() => toInternationalFormat('0201234567')).toThrow(
        /toInternationalFormat requires normalized mobile 07XXXXXXXX/
      );
    });

    it('should throw for invalid input', () => {
      expect(() => toInternationalFormat('12345')).toThrow();
    });
  });
});
