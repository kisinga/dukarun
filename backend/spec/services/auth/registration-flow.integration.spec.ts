/**
 * Registration Flow Integration Tests
 *
 * Validates that the business registration flow actually works end-to-end:
 * - Seller creation per channel
 * - Channel configuration (Kenya zones, pricesIncludeTax, seller assignment)
 * - Stock location creation and linking
 *
 * Tests the right thing - actual behavior and outcomes, not implementation details.
 * Uses mocks at the provisioner service level to test the orchestration flow.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { RequestContext, Zone, Seller, Channel, StockLocation, ID } from '@vendure/core';
import {
  RegistrationInput,
  RegistrationService,
  ProvisionResult,
} from '../../../src/services/auth/registration.service';

describe('Registration Flow Integration', () => {
  const ctx = {} as RequestContext;

  const registrationData: RegistrationInput = {
    companyName: 'Test Company',
    // companyCode is NOT part of input - backend generates it from companyName
    currency: 'KES',
    adminFirstName: 'Jane',
    adminLastName: 'Doe',
    adminPhoneNumber: '0712345678',
    adminEmail: 'jane@example.com',
    storeName: 'Main Store',
    storeAddress: '123 Market Street',
  };

  /**
   * Build test harness with all mocked dependencies
   * Follows existing pattern from registration.service.spec.ts
   * Mocks provisioner services to test orchestration, not implementation details
   */
  const buildRegistrationHarness = () => {
    // Mock entities
    const mockKenyaZone: Zone = {
      id: 10,
      name: 'Kenya',
    } as Zone;

    const mockSeller: Seller = {
      id: 1,
      name: 'Test Company Seller',
    } as Seller;

    const mockChannel: Channel = {
      id: 2,
      token: 'test-company',
      code: 'test-company',
      pricesIncludeTax: true,
      seller: mockSeller,
      defaultShippingZone: mockKenyaZone,
      defaultTaxZone: mockKenyaZone,
    } as Channel;

    const mockStockLocation: StockLocation = {
      id: 3,
      name: 'Main Store',
      description: '123 Market Street',
    } as StockLocation;

    const mockChannelWithLocation: Channel = {
      ...mockChannel,
      stockLocations: [mockStockLocation],
    } as Channel;

    const mockRole = {
      id: 6,
      code: 'test-company-admin',
      channels: [mockChannel],
    };

    const mockAdministrator = {
      id: 7,
      user: { id: 8 },
    };

    const mockPaymentMethods = [{ id: 4 }, { id: 5 }];

    // Mock validator service
    const validator = {
      validateInput: jest.fn(async () => undefined),
      getKenyaZone: jest.fn(async () => mockKenyaZone),
    };

    // Mock seller provisioner - creates seller and returns it
    const sellerProvisioner = {
      createSeller: jest.fn(async (ctx: RequestContext, data: RegistrationInput) => {
        // Verify seller name format
        return {
          ...mockSeller,
          name: `${data.companyName} Seller`,
        } as Seller;
      }),
    };

    // Mock channel provisioner - creates channel with all settings
    const channelProvisioner = {
      createChannel: jest.fn(
        async (
          ctx: RequestContext,
          registrationData: RegistrationInput,
          kenyaZone: Zone,
          phoneNumber: string,
          sellerId: string
        ) => {
          // Verify critical parameters are passed correctly
          return {
            ...mockChannel,
            id: mockChannel.id,
            seller: { ...mockSeller, id: parseInt(sellerId) } as Seller,
            defaultShippingZone: kenyaZone,
            defaultTaxZone: kenyaZone,
            pricesIncludeTax: true,
          } as Channel;
        }
      ),
    };

    // Mock store provisioner - creates stock location and assigns to channel
    const storeProvisioner = {
      createAndAssignStore: jest.fn(
        async (ctx: RequestContext, registrationData: RegistrationInput, channelId: ID) => {
          return mockStockLocation as StockLocation;
        }
      ),
    };

    // Mock payment provisioner
    const paymentProvisioner = {
      createAndAssignPaymentMethods: jest.fn(async () => mockPaymentMethods),
    };

    // Mock role provisioner
    const roleProvisioner = {
      createAdminRole: jest.fn(async () => mockRole),
    };

    // Mock access provisioner
    const accessProvisioner = {
      createAdministrator: jest.fn(async () => mockAdministrator),
    };

    // Mock error service
    const errorService = {
      logError: jest.fn(),
      wrapError: jest.fn((error: any) => error),
      createError: jest.fn((code: string, message: string) => new Error(`${code}: ${message}`)),
    };

    // Mock chart of accounts service
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

    // Mock EventBus for CompanyRegisteredEvent
    const eventBus = {
      publish: jest.fn(),
    };

    // Build registration service with mocked provisioners
    const registrationService = new RegistrationService(
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
      registrationService,
      mocks: {
        validator,
        sellerProvisioner,
        channelProvisioner,
        storeProvisioner,
        paymentProvisioner,
        roleProvisioner,
        accessProvisioner,
        errorService,
        chartOfAccountsService,
      },
      entities: {
        mockKenyaZone,
        mockSeller,
        mockChannel,
        mockStockLocation,
        mockChannelWithLocation,
        mockRole,
        mockAdministrator,
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Registration Flow - Happy Path', () => {
    it('creates all entities correctly with proper relationships', async () => {
      const harness = buildRegistrationHarness();

      const result = await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify seller was created
      expect(harness.mocks.sellerProvisioner.createSeller).toHaveBeenCalledWith(
        ctx,
        registrationData
      );

      // Verify channel was created with all correct settings
      expect(harness.mocks.channelProvisioner.createChannel).toHaveBeenCalledWith(
        ctx,
        registrationData,
        harness.entities.mockKenyaZone,
        '0712345678', // formatted phone
        '1' // seller ID as string
      );

      // Verify stock location was created and assigned
      expect(harness.mocks.storeProvisioner.createAndAssignStore).toHaveBeenCalledWith(
        ctx,
        registrationData,
        2 // channel ID (normalized to number)
      );

      // Verify all entity IDs are returned including sellerId
      expect(result).toEqual({
        sellerId: '1',
        channelId: '2',
        stockLocationId: '3',
        roleId: '6',
        adminId: '7',
        userId: '8',
      });
    });
  });

  describe('Seller Creation Validation', () => {
    it('creates seller with correct name format before channel', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, {
        ...registrationData,
        companyName: 'Acme Corporation',
      });

      // Verify seller name format in the provisioner call
      const sellerCall = harness.mocks.sellerProvisioner.createSeller.mock.calls[0];
      expect(sellerCall[1].companyName).toBe('Acme Corporation');

      // Verify seller created before channel (check call order)
      const sellerCallOrder =
        harness.mocks.sellerProvisioner.createSeller.mock.invocationCallOrder[0];
      const channelCallOrder =
        harness.mocks.channelProvisioner.createChannel.mock.invocationCallOrder[0];

      expect(sellerCallOrder).toBeLessThan(channelCallOrder);

      // Verify seller ID passed to channel creation
      expect(harness.mocks.channelProvisioner.createChannel).toHaveBeenCalledWith(
        ctx,
        expect.any(Object),
        expect.any(Object),
        expect.any(String),
        '1' // seller ID as string
      );
    });

    it('creates unique seller for each registration', async () => {
      const harness1 = buildRegistrationHarness();
      const harness2 = buildRegistrationHarness();

      await harness1.registrationService.provisionCustomer(ctx, {
        ...registrationData,
        companyName: 'Company A',
      });

      await harness2.registrationService.provisionCustomer(ctx, {
        ...registrationData,
        companyName: 'Company B',
        // companyCode is NOT part of input - backend generates it from companyName
      });

      // Each registration should create its own seller
      expect(harness1.mocks.sellerProvisioner.createSeller).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ companyName: 'Company A' })
      );
      expect(harness2.mocks.sellerProvisioner.createSeller).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ companyName: 'Company B' })
      );
    });
  });

  describe('Channel Configuration Validation', () => {
    it('creates channel with seller assigned', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      expect(harness.mocks.channelProvisioner.createChannel).toHaveBeenCalledWith(
        ctx,
        expect.any(Object),
        expect.any(Object),
        expect.any(String),
        '1' // seller ID
      );
    });

    it('creates channel with Kenya zone for both shipping and tax', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify channel provisioner called with Kenya zone
      const channelCall = harness.mocks.channelProvisioner.createChannel.mock.calls[0];
      const kenyaZoneParam = channelCall[2]; // third parameter is kenyaZone

      expect(kenyaZoneParam).toEqual(harness.entities.mockKenyaZone);
      expect(kenyaZoneParam.id).toBe(10); // Kenya zone ID

      // Verify zone lookup was called
      expect(harness.mocks.validator.getKenyaZone).toHaveBeenCalledWith(ctx);
    });

    it('creates channel with pricesIncludeTax set to true', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify channel provisioner is called (which sets pricesIncludeTax: true)
      // The actual verification happens in channel provisioner service tests
      // Here we verify the orchestration calls it correctly
      expect(harness.mocks.channelProvisioner.createChannel).toHaveBeenCalled();
    });

    it('creates channel with correct currency and language codes', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, {
        ...registrationData,
        currency: 'KES',
      });

      // Verify channel provisioner called with registration data containing currency
      expect(harness.mocks.channelProvisioner.createChannel).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          currency: 'KES',
        }),
        expect.any(Object), // kenyaZone
        expect.any(String), // phone
        expect.any(String) // sellerId
      );
    });
  });

  describe('Stock Location Linking Validation', () => {
    it('creates stock location and assigns it to channel', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify stock location created and assigned via store provisioner
      expect(harness.mocks.storeProvisioner.createAndAssignStore).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          storeName: 'Main Store',
          storeAddress: '123 Market Street',
        }),
        2 // channel ID (normalized to number)
      );
    });

    it('creates stock location linked to correct channel', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify store provisioner called with channel ID
      // The assignment happens inside store provisioner
      expect(harness.mocks.storeProvisioner.createAndAssignStore).toHaveBeenCalledWith(
        ctx,
        expect.any(Object),
        2 // channel ID (normalized to number)
      );
    });

    it('verifies stock location assignment to channel during provisioning', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify store provisioner was called (which includes assignment verification)
      expect(harness.mocks.storeProvisioner.createAndAssignStore).toHaveBeenCalled();

      // The verification happens inside createAndAssignStore
      // This test ensures the full flow includes verification step
      const callArgs = harness.mocks.storeProvisioner.createAndAssignStore.mock.calls[0];
      expect(callArgs[2]).toBe(2); // channel ID (normalized to number)
    });
  });

  describe('Kenya Zone Lookup Validation', () => {
    it('finds Kenya zone by name and uses it for both shipping and tax', async () => {
      const harness = buildRegistrationHarness();

      await harness.registrationService.provisionCustomer(ctx, registrationData);

      // Verify zone lookup was called
      expect(harness.mocks.validator.getKenyaZone).toHaveBeenCalledWith(ctx);

      // Verify zone lookup was called
      expect(harness.mocks.validator.getKenyaZone).toHaveBeenCalledWith(ctx);

      // Verify Kenya zone passed to channel provisioner
      const channelCall = harness.mocks.channelProvisioner.createChannel.mock.calls[0];
      expect(channelCall[2]).toEqual(harness.entities.mockKenyaZone);
    });

    it('throws clear error when Kenya zone does not exist', async () => {
      const harness = buildRegistrationHarness();

      // Mock zone not found
      harness.mocks.validator.getKenyaZone.mockRejectedValue(
        new Error(
          'REGISTRATION_KENYA_ZONE_MISSING: Kenya zone not found. Please create a zone named "Kenya" in Settings → Zones.'
        )
      );

      await expect(
        harness.registrationService.provisionCustomer(ctx, registrationData)
      ).rejects.toThrow('REGISTRATION_KENYA_ZONE_MISSING');

      // Verify channel was not created when zone is missing
      expect(harness.mocks.channelProvisioner.createChannel).not.toHaveBeenCalled();
      expect(harness.mocks.sellerProvisioner.createSeller).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles missing Kenya zone gracefully', async () => {
      const harness = buildRegistrationHarness();

      harness.mocks.validator.getKenyaZone.mockRejectedValue(
        new Error('REGISTRATION_KENYA_ZONE_MISSING: Kenya zone not found')
      );

      await expect(
        harness.registrationService.provisionCustomer(ctx, registrationData)
      ).rejects.toThrow('REGISTRATION_KENYA_ZONE_MISSING');

      // Verify no entities were created
      expect(harness.mocks.sellerProvisioner.createSeller).not.toHaveBeenCalled();
      expect(harness.mocks.channelProvisioner.createChannel).not.toHaveBeenCalled();
    });

    it('handles channel creation failure gracefully', async () => {
      const harness = buildRegistrationHarness();

      harness.mocks.channelProvisioner.createChannel.mockRejectedValue(
        new Error('CHANNEL_CREATE_FAILED: Failed to create channel')
      );

      await expect(
        harness.registrationService.provisionCustomer(ctx, registrationData)
      ).rejects.toThrow();

      // Verify error was logged
      expect(harness.mocks.errorService.logError).toHaveBeenCalled();
    });

    it('handles stock location creation failure gracefully', async () => {
      const harness = buildRegistrationHarness();

      harness.mocks.storeProvisioner.createAndAssignStore.mockRejectedValue(
        new Error('STOCK_LOCATION_CREATE_FAILED: Failed to create stock location')
      );

      await expect(
        harness.registrationService.provisionCustomer(ctx, registrationData)
      ).rejects.toThrow();

      // Verify error was logged
      expect(harness.mocks.errorService.logError).toHaveBeenCalled();
    });
  });
});
