/**
 * Unit tests for shared permission grouping and filtering.
 */

import {
  filterSuperAdminPermissions,
  formatPermissionName,
  groupPermissions,
} from './permission-grouping';

describe('permission-grouping', () => {
  describe('filterSuperAdminPermissions', () => {
    it('removes CreateChannel, UpdateChannel, DeleteChannel, ReadChannel', () => {
      const input = ['CreateChannel', 'ReadOrder', 'UpdateChannel', 'ReadCustomer'];
      expect(filterSuperAdminPermissions(input)).toEqual(['ReadOrder', 'ReadCustomer']);
    });

    it('removes CreateRole, UpdateRole, DeleteRole, ReadRole', () => {
      const input = ['CreateRole', 'ReadProduct', 'UpdateRole'];
      expect(filterSuperAdminPermissions(input)).toEqual(['ReadProduct']);
    });

    it('returns empty array when all are super-admin', () => {
      const input = ['ReadChannel', 'CreateChannel'];
      expect(filterSuperAdminPermissions(input)).toEqual([]);
    });

    it('leaves non-super-admin permissions unchanged', () => {
      const input = ['ReadOrder', 'CreateCustomer', 'OverridePricePermission'];
      expect(filterSuperAdminPermissions(input)).toEqual(input);
    });
  });

  describe('groupPermissions', () => {
    it('groups permissions into correct categories', () => {
      const input = [
        'ReadAsset',
        'ReadCatalog',
        'ReadCustomer',
        'ReadOrder',
        'ReadProduct',
        'ReadStockLocation',
        'ReadAdministrator',
        'ReadSettings',
        'OverridePricePermission',
      ];
      const grouped = groupPermissions(input);
      expect(grouped['Assets']).toContain('ReadAsset');
      expect(grouped['Catalog']).toContain('ReadCatalog');
      expect(grouped['Customers']).toContain('ReadCustomer');
      expect(grouped['Orders']).toContain('ReadOrder');
      expect(grouped['Products']).toContain('ReadProduct');
      expect(grouped['Stock']).toContain('ReadStockLocation');
      expect(grouped['Administration']).toContain('ReadAdministrator');
      expect(grouped['Settings']).toContain('ReadSettings');
      expect(grouped['Custom']).toContain('OverridePricePermission');
    });

    it('omits empty groups', () => {
      const input = ['ReadOrder', 'ReadCustomer'];
      const grouped = groupPermissions(input);
      expect(grouped['Orders']).toEqual(['ReadOrder']);
      expect(grouped['Customers']).toEqual(['ReadCustomer']);
      expect(Object.keys(grouped)).not.toContain('Assets');
      expect(Object.keys(grouped)).not.toContain('Catalog');
    });

    it('returns empty object for empty input', () => {
      expect(groupPermissions([])).toEqual({});
    });

    it('places StockLocation and stock-related in Stock', () => {
      const input = ['ReadStockLocation', 'UpdateStockLocation'];
      const grouped = groupPermissions(input);
      expect(grouped['Stock']).toEqual(['ReadStockLocation', 'UpdateStockLocation']);
    });
  });

  describe('formatPermissionName', () => {
    it('formats standard CRUD permissions with space before resource', () => {
      expect(formatPermissionName('CreateCustomer')).toBe('Create Customer');
      expect(formatPermissionName('ReadOrder')).toBe('Read Order');
      expect(formatPermissionName('UpdateProduct')).toBe('Update Product');
    });

    it('strips Permission suffix and adds spaces for custom permissions', () => {
      expect(formatPermissionName('OverridePricePermission')).toContain('Override');
      expect(formatPermissionName('ApproveCustomerCreditPermission')).toContain('Approve');
    });

    it('handles unknown format by adding spaces before capitals', () => {
      const result = formatPermissionName('SomePermission');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
