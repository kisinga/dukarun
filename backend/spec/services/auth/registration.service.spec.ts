import { describe, expect, it, jest } from '@jest/globals';
import { RequestContext, User } from '@vendure/core';
import {
  RegistrationInput,
  RegistrationService,
} from '../../../src/services/auth/registration.service';

describe('RegistrationService.provisionCustomer', () => {
  const ctx = {} as RequestContext;

  const registrationData: RegistrationInput = {
    companyName: 'Test Company',
    // companyCode is NOT part of input - backend generates it from companyName
    currency: 'USD',
    adminFirstName: 'Jane',
    adminLastName: 'Doe',
    adminPhoneNumber: '0712345678',
    adminEmail: 'jane@example.com',
    storeName: 'Main Store',
    storeAddress: '123 Market Street',
  };

  const buildService = () => {
    const validator = {
      validateInput: jest.fn(async () => undefined),
      getKenyaZone: jest.fn(async () => ({ id: 10, name: 'Kenya' })),
    };

    const seller = { id: 1, name: 'Test Company Seller' };
    const sellerProvisioner = {
      createSeller: jest.fn(async () => seller),
    };

    const channel = { id: 2, token: 'token-2' };

    const channelProvisioner = {
      createChannel: jest.fn(async () => channel),
    };

    const stockLocation = { id: 3 };
    const storeProvisioner = {
      createAndAssignStore: jest.fn(async () => stockLocation),
    };

    const paymentMethods = [{ id: 4 }, { id: 5 }];
    const paymentProvisioner = {
      createAndAssignPaymentMethods: jest.fn(async () => paymentMethods),
    };

    const role = { id: 6, code: 'test-role', channels: [{ id: 2 }] };
    const roleProvisioner = {
      createAdminRole: jest.fn(async () => role),
    };

    const administrator = { id: 7, user: { id: 8 } };
    const accessProvisioner = {
      createAdministrator: jest.fn(async () => administrator),
    };

    const errorService = {
      logError: jest.fn(),
      wrapError: jest.fn((error: any) => error),
      createError: jest.fn((code: string, message: string) => new Error(`${code}: ${message}`)),
    };

    const chartOfAccountsService = {
      initializeForChannel: jest.fn(async () => ({
        created: [
          'CASH',
          'CASH_ON_HAND',
          'BANK_MAIN',
          'CLEARING_MPESA',
          'CLEARING_CREDIT',
          'CLEARING_GENERIC',
          'SALES',
          'SALES_RETURNS',
          'ACCOUNTS_RECEIVABLE',
          'INVENTORY',
          'ACCOUNTS_PAYABLE',
          'TAX_PAYABLE',
          'PURCHASES',
          'EXPENSES',
          'PROCESSOR_FEES',
          'CASH_SHORT_OVER',
          'COGS',
          'INVENTORY_WRITE_OFF',
          'EXPIRY_LOSS',
        ],
        existing: [],
      })),
      verifyChannelAccounts: jest.fn(async () => undefined),
    };

    const eventBus = {
      publish: jest.fn(),
    };

    const service = new RegistrationService(
      validator as any,
      sellerProvisioner as any,
      channelProvisioner as any,
      storeProvisioner as any,
      paymentProvisioner as any,
      roleProvisioner as any,
      accessProvisioner as any,
      errorService as any,
      chartOfAccountsService as any,
      eventBus as any,
      undefined // tracingService
    );

    return {
      service,
      validator,
      sellerProvisioner,
      channelProvisioner,
      storeProvisioner,
      paymentProvisioner,
      roleProvisioner,
      accessProvisioner,
      errorService,
      chartOfAccountsService,
      seller,
      channel,
      stockLocation,
      role,
      administrator,
    };
  };

  it('provisions new customer entities including default store', async () => {
    const harness = buildService();

    const result = await harness.service.provisionCustomer(ctx, {
      ...registrationData,
      storeName: '  Test Store  ',
    });

    expect(harness.validator.validateInput).toHaveBeenCalled();
    expect(harness.storeProvisioner.createAndAssignStore).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ storeName: '  Test Store  ' }),
      harness.channel.id
    );

    // Verify chart of accounts initialization
    expect(harness.chartOfAccountsService.initializeForChannel).toHaveBeenCalledWith(
      ctx,
      harness.channel.id
    );
    // Note: verifyChannelAccounts is no longer called directly - verification
    // is done using the return value from initializeForChannel

    expect(result).toEqual({
      sellerId: harness.seller.id.toString(),
      channelId: harness.channel.id.toString(),
      stockLocationId: harness.stockLocation.id.toString(),
      roleId: harness.role.id.toString(),
      adminId: harness.administrator.id.toString(),
      userId: harness.administrator.user.id.toString(),
    });
  });

  it('passes existing user to access provisioner when provided', async () => {
    const harness = buildService();
    const existingUser = { id: 99 } as User;

    await harness.service.provisionCustomer(ctx, registrationData, existingUser);

    expect(harness.accessProvisioner.createAdministrator).toHaveBeenCalledWith(
      ctx,
      registrationData,
      harness.role,
      '0712345678',
      existingUser
    );
  });
});
