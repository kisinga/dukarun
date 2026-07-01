import { toDisplayDate } from '../../../../core/utils/date.util';

/**
 * Pure formatting helpers for the accounting page. No DI; safe to use in components and tests.
 */
const DEFAULT_LOCALE = 'en-KE';

export function formatCurrency(amountInCents: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
  }).format(amountInCents / 100);
}

export function formatDate(dateStr: string): string {
  return toDisplayDate(dateStr, 'medium');
}

export function formatDateTime(dateStr: string): string {
  return toDisplayDate(dateStr, 'datetime');
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};

export function getAccountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  'inter-account-transfer': 'Inter-account transfer',
  Expense: 'Expense',
};

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType;
}
