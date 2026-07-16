/**
 * Expense categories for business expenses (must match backend codes).
 * Used in record-expense modal and expenses list display.
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

export function getExpenseCategoryLabel(code: string | null | undefined): string {
  if (!code) return 'Uncategorized';
  const cat = EXPENSE_CATEGORIES.find((c) => c.code === code);
  return cat?.label ?? 'Uncategorized';
}
