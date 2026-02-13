export type NavIcon =
  | 'overview'
  | 'sell'
  | 'sales'
  | 'payments'
  | 'expenses'
  | 'products'
  | 'credit'
  | 'customers'
  | 'suppliers'
  | 'purchases'
  | 'accounting'
  | 'stock-adjustments'
  | 'settings'
  | 'admin'
  | 'upgrade'
  | 'approvals';

export interface NavItem {
  label: string;
  icon: NavIcon;
  route: string | string[];
  queryParams?: Record<string, string>;
  /** Item is shown only when this returns true. Omit for always-visible. */
  visible?: () => boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}
