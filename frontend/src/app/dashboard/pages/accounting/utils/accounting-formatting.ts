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

export function formatDate(dateStr: string, locale: string = DEFAULT_LOCALE): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string, locale: string = DEFAULT_LOCALE): string {
  return new Date(dateStr).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
