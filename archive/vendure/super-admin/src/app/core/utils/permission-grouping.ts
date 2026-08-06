/**
 * Permission grouping and formatting for super-admin role template and user permission UI.
 */

const GROUP_ORDER = [
  'Assets',
  'Catalog',
  'Customers',
  'Orders',
  'Products',
  'Stock',
  'Administration',
  'Settings',
  'Custom',
] as const;

export function groupPermissions(permissions: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    Assets: [],
    Catalog: [],
    Customers: [],
    Orders: [],
    Products: [],
    Stock: [],
    Administration: [],
    Settings: [],
    Custom: [],
  };

  for (const perm of permissions) {
    const permUpper = perm.toUpperCase();
    if (permUpper.includes('ASSET')) {
      groups['Assets'].push(perm);
    } else if (permUpper.includes('CATALOG')) {
      groups['Catalog'].push(perm);
    } else if (permUpper.includes('CUSTOMER')) {
      groups['Customers'].push(perm);
    } else if (permUpper.includes('ORDER')) {
      groups['Orders'].push(perm);
    } else if (permUpper.includes('PRODUCT')) {
      groups['Products'].push(perm);
    } else if (permUpper.includes('STOCKLOCATION') || permUpper.includes('STOCK')) {
      groups['Stock'].push(perm);
    } else if (permUpper.includes('ADMINISTRATOR') || permUpper.includes('ADMIN') || permUpper.includes('CHANNEL') || permUpper.includes('ROLE')) {
      groups['Administration'].push(perm);
    } else if (permUpper.includes('SETTINGS') || permUpper.includes('SETTING')) {
      groups['Settings'].push(perm);
    } else {
      groups['Custom'].push(perm);
    }
  }

  const result: Record<string, string[]> = {};
  for (const key of GROUP_ORDER) {
    if (groups[key].length > 0) {
      result[key] = groups[key];
    }
  }
  return result;
}

export function formatPermissionName(permission: string): string {
  if (permission.includes('Permission')) {
    return permission
      .replace(/Permission$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim();
  }
  const action = permission.match(/^(Create|Read|Update|Delete)/)?.[0] || '';
  const resource = permission.replace(/^(Create|Read|Update|Delete)/, '');
  if (action && resource) {
    return `${action} ${resource.replace(/([A-Z])/g, ' $1').trim()}`;
  }
  return permission.replace(/([A-Z])/g, ' $1').trim();
}
