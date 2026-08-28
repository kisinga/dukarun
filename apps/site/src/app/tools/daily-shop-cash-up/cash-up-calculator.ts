export const CASH_UP_FIELDS = [
  'openingCash',
  'cashSales',
  'mpesaSales',
  'creditSales',
  'cashDebtRepayments',
  'mpesaDebtRepayments',
  'cashExpenses',
  'cashRemoved',
  'actualClosingCash',
  'actualMpesaReceipts',
] as const;

export type CashUpField = (typeof CASH_UP_FIELDS)[number];
export type CashUpFormValues = Record<CashUpField, string>;
export type CashUpMinorInput = Record<CashUpField, number>;
export type CashUpVarianceStatus = 'balanced' | 'short' | 'over';

export interface ParsedCashUpForm {
  readonly input: CashUpMinorInput | null;
  readonly errors: Partial<Record<CashUpField, string>>;
}

export interface CashUpSummary {
  readonly expectedCash: number;
  readonly cashVariance: number;
  readonly expectedMpesaReceipts: number;
  readonly mpesaVariance: number;
  readonly recordedSales: number;
  readonly moneyReceived: number;
  readonly totalVariance: number;
}

export function emptyCashUpForm(): CashUpFormValues {
  return Object.fromEntries(CASH_UP_FIELDS.map(field => [field, ''])) as CashUpFormValues;
}

/** Parses a non-negative KES amount into integer cents without floating point rounding. */
export function parseKesAmount(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole)) return null;

  const fraction = Number(fractionPart.padEnd(2, '0'));
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

export function parseCashUpForm(values: CashUpFormValues): ParsedCashUpForm {
  const input = {} as CashUpMinorInput;
  const errors: Partial<Record<CashUpField, string>> = {};

  for (const field of CASH_UP_FIELDS) {
    const parsed = parseKesAmount(values[field]);
    if (parsed === null) {
      errors[field] = 'Enter zero or a positive amount with no more than two decimal places.';
    } else {
      input[field] = parsed;
    }
  }

  return {
    input: Object.keys(errors).length ? null : input,
    errors,
  };
}

export function calculateCashUp(input: CashUpMinorInput): CashUpSummary {
  const expectedCash =
    input.openingCash +
    input.cashSales +
    input.cashDebtRepayments -
    input.cashExpenses -
    input.cashRemoved;
  const cashVariance = input.actualClosingCash - expectedCash;
  const expectedMpesaReceipts = input.mpesaSales + input.mpesaDebtRepayments;
  const mpesaVariance = input.actualMpesaReceipts - expectedMpesaReceipts;
  const recordedSales = input.cashSales + input.mpesaSales + input.creditSales;
  const moneyReceived =
    input.cashSales + input.mpesaSales + input.cashDebtRepayments + input.mpesaDebtRepayments;

  return {
    expectedCash,
    cashVariance,
    expectedMpesaReceipts,
    mpesaVariance,
    recordedSales,
    moneyReceived,
    totalVariance: cashVariance + mpesaVariance,
  };
}

export function varianceStatus(amount: number): CashUpVarianceStatus {
  if (amount < 0) return 'short';
  if (amount > 0) return 'over';
  return 'balanced';
}
