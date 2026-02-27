export type NavIcon =
  | 'overview'
  | 'channels'
  | 'users'
  | 'platform-data'
  | 'login-attempts'
  | 'role-templates'
  | 'pending'
  | 'subscription-tiers'
  | 'ml-trainer';

export interface NavItem {
  label: string;
  icon: NavIcon;
  route: string | string[];
  queryParams?: Record<string, string>;
  visible?: () => boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}
