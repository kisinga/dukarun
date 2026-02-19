/**
 * Expense categories for business expenses.
 * Used when recording expenses and for dashboard breakdown.
 * Stored as code in journal line meta.expenseCategory.
 */

export const EXPENSE_CATEGORIES: { code: string; label: string; icon: string }[] = [
  { code: 'operations', label: 'Operations', icon: '📦' },
  { code: 'utilities', label: 'Utilities & premises', icon: '🏠' },
  { code: 'payroll', label: 'Payroll & people', icon: '👥' },
  { code: 'marketing', label: 'Marketing & advertising', icon: '📢' },
  { code: 'travel', label: 'Travel & transport', icon: '🚗' },
  { code: 'professional', label: 'Professional & fees', icon: '📋' },
  { code: 'other', label: 'Other', icon: '📌' },
];

export const EXPENSE_CATEGORY_CODES = new Set(EXPENSE_CATEGORIES.map(c => c.code));

export function getExpenseCategoryLabel(code: string | null | undefined): string {
  if (!code) return 'Uncategorized';
  const cat = EXPENSE_CATEGORIES.find(c => c.code === code);
  return cat?.label ?? 'Uncategorized';
}

export function getExpenseCategoryIcon(code: string | null | undefined): string {
  if (!code) return '❓';
  const cat = EXPENSE_CATEGORIES.find(c => c.code === code);
  return cat?.icon ?? '❓';
}
