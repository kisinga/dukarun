import { describe, expect, it } from 'vitest';
import {
  calculateCashUp,
  emptyCashUpForm,
  parseCashUpForm,
  parseKesAmount,
  varianceStatus,
} from './cash-up-calculator';

describe('cash-up calculator', () => {
  it('parses KES amounts into integer cents', () => {
    expect(parseKesAmount('')).toBe(0);
    expect(parseKesAmount('0')).toBe(0);
    expect(parseKesAmount('12.3')).toBe(1230);
    expect(parseKesAmount('12.34')).toBe(1234);
    expect(parseKesAmount('0012.05')).toBe(1205);
  });

  it('rejects negative, non-finite, grouped, and over-precise values', () => {
    expect(parseKesAmount('-1')).toBeNull();
    expect(parseKesAmount('Infinity')).toBeNull();
    expect(parseKesAmount('1,000')).toBeNull();
    expect(parseKesAmount('12.345')).toBeNull();
    expect(parseKesAmount('90071992547410')).toBeNull();
  });

  it('treats blank fields as zero and reports invalid fields', () => {
    const blank = parseCashUpForm(emptyCashUpForm());
    expect(blank.errors).toEqual({});
    expect(blank.input?.cashSales).toBe(0);

    const invalid = parseCashUpForm({ ...emptyCashUpForm(), cashSales: '-50' });
    expect(invalid.input).toBeNull();
    expect(invalid.errors.cashSales).toContain('positive amount');
  });

  it('keeps sales, receipts, and closing variances distinct', () => {
    const parsed = parseCashUpForm({
      openingCash: '1000',
      cashSales: '6000',
      mpesaSales: '7000',
      creditSales: '2000',
      cashDebtRepayments: '500',
      mpesaDebtRepayments: '1000',
      cashExpenses: '300',
      cashRemoved: '2000',
      actualClosingCash: '5200',
      actualMpesaReceipts: '7800',
    });

    expect(parsed.errors).toEqual({});
    expect(calculateCashUp(parsed.input!)).toEqual({
      expectedCash: 520_000,
      cashVariance: 0,
      expectedMpesaReceipts: 800_000,
      mpesaVariance: -20_000,
      recordedSales: 1_500_000,
      moneyReceived: 1_450_000,
      totalVariance: -20_000,
    });
  });

  it('labels exact, negative, and positive variances without assigning a cause', () => {
    expect(varianceStatus(0)).toBe('balanced');
    expect(varianceStatus(-1)).toBe('short');
    expect(varianceStatus(1)).toBe('over');
  });
});
