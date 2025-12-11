import {
  generateSentinelEmailFromPhone,
  getWalkInEmail,
  isSentinelEmail,
  shouldSendEmail,
  maskEmail,
  generatePaystackEmailFromPhone,
} from '../src/utils/email.utils';

describe('EmailUtils', () => {
  describe('isSentinelEmail', () => {
    it('should identify walkin sentinel email', () => {
      expect(isSentinelEmail('walkin@pos.local')).toBe(true);
    });

    it('should identify customer sentinel email', () => {
      expect(isSentinelEmail('customer.0712345678@pos.local')).toBe(true);
    });

    it('should identify supplier sentinel email', () => {
      expect(isSentinelEmail('supplier.0712345678@pos.local')).toBe(true);
    });

    it('should identify admin sentinel email', () => {
      expect(isSentinelEmail('admin.0712345678@pos.local')).toBe(true);
    });

    it('should case-insensitive match', () => {
      expect(isSentinelEmail('Walkin@POS.local')).toBe(true);
    });

    it('should return false for regular emails', () => {
      expect(isSentinelEmail('john.doe@example.com')).toBe(false);
      expect(isSentinelEmail('test@pos.local.com')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isSentinelEmail(null)).toBe(false);
      expect(isSentinelEmail(undefined)).toBe(false);
    });
  });

  describe('shouldSendEmail', () => {
    it('should return false for sentinel emails', () => {
      expect(shouldSendEmail('walkin@pos.local')).toBe(false);
    });

    it('should return true for regular emails', () => {
      expect(shouldSendEmail('john.doe@example.com')).toBe(true);
    });
  });

  describe('generateSentinelEmailFromPhone', () => {
    it('should generate customer email by default', () => {
      const email = generateSentinelEmailFromPhone('0712345678');
      expect(email).toBe('customer.0712345678@pos.local');
    });

    it('should generate supplier email', () => {
      const email = generateSentinelEmailFromPhone('0712345678', 'supplier');
      expect(email).toBe('supplier.0712345678@pos.local');
    });

    it('should generate admin email', () => {
      const email = generateSentinelEmailFromPhone('0712345678', 'admin');
      expect(email).toBe('admin.0712345678@pos.local');
    });

    it('should normalize phone number', () => {
      const email = generateSentinelEmailFromPhone('+254712345678');
      expect(email).toBe('customer.0712345678@pos.local');
    });
  });

  describe('getWalkInEmail', () => {
    it('should return correct walk-in email', () => {
      expect(getWalkInEmail()).toBe('walkin@pos.local');
    });
  });

  describe('Legacy Utilities', () => {
    it('generatePaystackEmailFromPhone should work', () => {
      expect(generatePaystackEmailFromPhone('0712345678')).toBe('customer.0712345678@dukahub.com');
    });

    it('maskEmail should mask correctly', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j***e@example.com');
    });
  });
});
