import { formatPhoneNumber, validatePhoneNumber } from '../../src/utils/phone.utils';

describe('phone.utils', () => {
  describe('formatPhoneNumber', () => {
    it('should return the same number when already normalized', () => {
      expect(formatPhoneNumber('0712345678')).toBe('0712345678');
    });

    it('should normalize international format with plus prefix', () => {
      expect(formatPhoneNumber('+254712345678')).toBe('0712345678');
    });

    it('should normalize international format without plus prefix', () => {
      expect(formatPhoneNumber('254712345678')).toBe('0712345678');
    });

    it('should normalize number missing leading zero', () => {
      expect(formatPhoneNumber('712345678')).toBe('0712345678');
    });

    it('should reject numbers with invalid prefix', () => {
      expect(() => formatPhoneNumber('0812345678')).toThrow(
        'Phone number must start with 07. Received: 0812345678'
      );
    });

    it('should reject numbers with invalid length', () => {
      expect(() => formatPhoneNumber('07123456789')).toThrow(
        'Invalid phone number format. Expected 07XXXXXXXX (10 digits). Received: 07123456789'
      );
    });

    it('should reject empty phone numbers', () => {
      expect(() => formatPhoneNumber('')).toThrow('Phone number is required');
    });
  });

  describe('validatePhoneNumber', () => {
    it('should return true for normalized numbers', () => {
      expect(validatePhoneNumber('0712345678')).toBe(true);
    });

    it('should return true for international numbers', () => {
      expect(validatePhoneNumber('+254712345678')).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(validatePhoneNumber('12345')).toBe(false);
    });
  });
});
