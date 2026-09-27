import { describe, expect, it, vi } from 'vitest';
import { CustomersComponent } from './customers.component';

type Harness = {
  perms: { has(permission: string): boolean };
  money: { creditOrders: ReturnType<typeof vi.fn> };
  canReadCustomerAccount(): boolean;
  loadCreditOrders(customerId: string): Promise<unknown[]>;
};
function setup(permission: string): Harness {
  const component = Object.create(CustomersComponent.prototype) as Harness;
  component.perms = { has: requested => requested === permission };
  component.money = { creditOrders: vi.fn().mockResolvedValue([{ outstanding: 50 }]) };
  return component;
}

describe('Customer account read permissions', () => {
  it('does not call the account RPC for a credit-limit-only user', async () => {
    const component = setup('ManageCustomerCreditLimit');
    expect(component.canReadCustomerAccount()).toBe(false);
    await expect(component.loadCreditOrders('customer-1')).resolves.toEqual([]);
    expect(component.money.creditOrders).not.toHaveBeenCalled();
  });

  it.each(['ViewFinancials', 'SettleOrder', 'ManageCustomers'])(
    'loads the canonical account for %s',
    async permission => {
      const component = setup(permission);
      expect(component.canReadCustomerAccount()).toBe(true);
      await expect(component.loadCreditOrders('customer-1')).resolves.toEqual([
        { outstanding: 50 },
      ]);
      expect(component.money.creditOrders).toHaveBeenCalledWith('customer-1');
    }
  );
});
