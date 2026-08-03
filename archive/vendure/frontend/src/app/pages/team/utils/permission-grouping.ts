/**
 * Shared permission grouping and filtering for team/permission UI.
 * Used by create-admin-modal and permission-editor so categories and labels stay in sync.
 */

/** Permission substrings that should not be shown in channel admin UI (super-admin only). */
export const SUPER_ADMIN_PERMISSION_SUBSTRINGS = [
  'CreateChannel',
  'UpdateChannel',
  'DeleteChannel',
  'ReadChannel',
  'CreateRole',
  'UpdateRole',
  'DeleteRole',
  'ReadRole',
] as const;

const superAdminSet = new Set<string>(SUPER_ADMIN_PERMISSION_SUBSTRINGS);

/**
 * Filter out super-admin-only permissions from a list.
 */
export function filterSuperAdminPermissions(permissions: string[]): string[] {
  return permissions.filter((perm) => {
    return !Array.from(superAdminSet).some((superPerm) => perm.includes(superPerm));
  });
}

/** Category keys for grouped permissions (order preserved for display). */
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

/**
 * Group permissions by category for display in expansion panels / step 2.
 */
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
    } else if (permUpper.includes('ADMINISTRATOR') || permUpper.includes('ADMIN')) {
      groups['Administration'].push(perm);
    } else if (permUpper.includes('SETTINGS') || permUpper.includes('SETTING')) {
      groups['Settings'].push(perm);
    } else {
      groups['Custom'].push(perm);
    }
  }

  // Remove empty groups and preserve order
  const result: Record<string, string[]> = {};
  for (const key of GROUP_ORDER) {
    if (groups[key].length > 0) {
      result[key] = groups[key];
    }
  }
  return result;
}

/**
 * Format permission string for display (e.g. "CreateCustomer" -> "Create Customer").
 */
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
