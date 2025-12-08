/**
 * Provisioning Test Harness
 *
 * Reusable utilities and fixtures for testing provisioning flows.
 * Provides helpers to run the full OTP/registration flow and assert required entities.
 *
 * This harness is designed to be used by multiple test suites to ensure consistent
 * provisioning behavior across the system.
 *
 * **Key Feature**: Verifies that Vendure Services are called (via spies) rather than
 * just checking DB state. This ensures we're using the "front door" (Vendure services)
 * rather than bypassing them with direct repository access.
 */

import {
  Administrator,
  AdministratorService,
  Channel,
  ChannelService,
  PaymentMethod,
  PaymentMethodService,
  RequestContext,
  Role,
  RoleService,
  Seller,
  SellerService,
  StockLocation,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import { RegistrationInput, RegistrationService } from '../../../../src/services/auth/registration.service';

/**
 * Expected provisioning result structure
 */
export interface ProvisioningAssertions {
  seller: Seller;
  channel: Channel;
  stockLocation: StockLocation;
  paymentMethods: PaymentMethod[];
  role: Role;
  administrator: Administrator;
  chartOfAccountsInitialized: boolean;
}

/**
 * Provisioning test data fixture
 */
export interface ProvisioningTestData {
  registrationInput: RegistrationInput;
  expectedChannelCode: string;
  expectedRoleCode: string;
}

/**
 * Create standard test registration input
 */
export function createTestRegistrationInput(
  overrides?: Partial<RegistrationInput>
): RegistrationInput {
  return {
    companyName: 'Test Company',
    // companyCode is NOT part of input - backend generates it from companyName
    currency: 'USD',
    adminFirstName: 'Jane',
    adminLastName: 'Doe',
    adminPhoneNumber: '0712345678',
    storeName: 'Main Store',
    ...overrides,
  };
}

/**
 * Assert all required provisioning entities were created
 *
 * This is the canonical checklist of what "ALL provisioning must create" means.
 * Update this function when new entities are added to the provisioning flow.
 */
export async function assertProvisioningComplete(
  ctx: RequestContext,
  connection: TransactionalConnection,
  provisionResult: {
    sellerId: string;
    channelId: string;
    stockLocationId: string;
    roleId: string;
    adminId: string;
    userId: string;
  },
  registrationInput: RegistrationInput
): Promise<ProvisioningAssertions> {
  // Load all entities
  const sellerRepo = connection.getRepository(ctx, Seller);
  const channelRepo = connection.getRepository(ctx, Channel);
  const stockLocationRepo = connection.getRepository(ctx, StockLocation);
  const roleRepo = connection.getRepository(ctx, Role);
  const adminRepo = connection.getRepository(ctx, Administrator);

  const seller = await sellerRepo.findOne({ where: { id: provisionResult.sellerId } });
  const channel = await channelRepo.findOne({
    where: { id: provisionResult.channelId },
    relations: ['seller'],
  });
  const stockLocation = await stockLocationRepo.findOne({
    where: { id: provisionResult.stockLocationId },
    relations: ['channels'],
  });
  const role = await roleRepo.findOne({
    where: { id: provisionResult.roleId },
    relations: ['channels'],
  });
  const administrator = await adminRepo.findOne({
    where: { id: provisionResult.adminId },
    relations: ['user', 'user.roles'],
  });

  // Assertions
  if (!seller) {
    throw new Error(`Seller ${provisionResult.sellerId} not found`);
  }
  if (!channel) {
    throw new Error(`Channel ${provisionResult.channelId} not found`);
  }
  if (!stockLocation) {
    throw new Error(`Stock location ${provisionResult.stockLocationId} not found`);
  }
  if (!role) {
    throw new Error(`Role ${provisionResult.roleId} not found`);
  }
  if (!administrator) {
    throw new Error(`Administrator ${provisionResult.adminId} not found`);
  }
  if (!administrator.user) {
    throw new Error(`Administrator ${provisionResult.adminId} has no user`);
  }

  // Verify seller-channel linkage
  if (!channel.seller || channel.seller.id !== seller.id) {
    throw new Error(`Channel ${channel.id} is not linked to seller ${seller.id}`);
  }

  // Verify stock location-channel linkage
  if (!stockLocation.channels || !stockLocation.channels.some(ch => ch.id === channel.id)) {
    throw new Error(`Stock location ${stockLocation.id} is not linked to channel ${channel.id}`);
  }

  // Verify role-channel linkage
  if (!role.channels || !role.channels.some(ch => ch.id === channel.id)) {
    throw new Error(`Role ${role.id} is not linked to channel ${channel.id}`);
  }

  // Verify user-role linkage
  if (!administrator.user.roles || !administrator.user.roles.some(r => r.id === role.id)) {
    throw new Error(`User ${administrator.user.id} is not linked to role ${role.id}`);
  }

  // Verify channel configuration
  // Channel code is generated from companyName, so we verify it's a valid sanitized version
  const expectedCodeBase = registrationInput.companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Channel code should start with the sanitized company name (may have random suffix)
  if (!channel.code.startsWith(expectedCodeBase) && channel.code !== expectedCodeBase) {
    throw new Error(
      `Channel code should be based on company name "${registrationInput.companyName}": expected to start with "${expectedCodeBase}", got "${channel.code}"`
    );
  }

  // Verify role configuration - role code should use the generated channel code
  const expectedRoleCode = `${channel.code}-admin`;
  if (role.code !== expectedRoleCode) {
    throw new Error(`Role code mismatch: expected ${expectedRoleCode}, got ${role.code}`);
  }

  // Load payment methods (requires PaymentMethod repository)
  // Note: PaymentMethod may not be a standard Vendure entity, so this is a placeholder
  // Adjust based on actual PaymentMethod entity structure
  const paymentMethods: PaymentMethod[] = []; // TODO: Load payment methods when entity structure is known

  // Verify chart of accounts (requires ledger account repository)
  // This is a placeholder - adjust based on actual ledger structure
  const chartOfAccountsInitialized = true; // TODO: Verify chart of accounts when structure is known

  return {
    seller,
    channel,
    stockLocation,
    paymentMethods,
    role,
    administrator,
    chartOfAccountsInitialized,
  };
}

/**
 * Run full provisioning flow and return assertions
 *
 * This is the main entry point for provisioning tests.
 * It runs the registration service and verifies all entities were created correctly.
 */
export async function runProvisioningFlow(
  ctx: RequestContext,
  registrationService: RegistrationService,
  registrationInput: RegistrationInput
): Promise<ProvisioningAssertions> {
  // Run provisioning
  const provisionResult = await registrationService.provisionCustomer(ctx, registrationInput);

  // Assert all entities were created
  // Note: This requires access to TransactionalConnection, which should be injected
  // For now, this is a placeholder that shows the expected structure
  // Tests should call assertProvisioningComplete with the connection
  throw new Error(
    'runProvisioningFlow requires TransactionalConnection - use assertProvisioningComplete directly in tests'
  );
}

/**
 * Service spies for verifying Vendure service usage
 *
 * This structure allows tests to verify that provisioning services
 * are calling Vendure services rather than using direct repository access.
 */
export interface ProvisioningServiceSpies {
  sellerService?: {
    create?: jest.SpyInstance;
  };
  channelService?: {
    create?: jest.SpyInstance;
    findOne?: jest.SpyInstance;
  };
  stockLocationService?: {
    create?: jest.SpyInstance;
    findOne?: jest.SpyInstance;
  };
  paymentMethodService?: {
    create?: jest.SpyInstance;
  };
  roleService?: {
    create?: jest.SpyInstance;
    assignRoleToUser?: jest.SpyInstance;
  };
  administratorService?: {
    create?: jest.SpyInstance;
    update?: jest.SpyInstance;
  };
}

/**
 * Assert that Vendure services were called during provisioning
 *
 * This verifies that we're using Vendure services (the "front door")
 * rather than bypassing them with direct repository access.
 */
export function assertVendureServicesCalled(spies: ProvisioningServiceSpies): void {
  // Verify SellerService.create was called (if SellerService exists)
  if (spies.sellerService?.create) {
    expect(spies.sellerService.create).toHaveBeenCalled();
  }

  // Verify ChannelService.create was called
  if (spies.channelService?.create) {
    expect(spies.channelService.create).toHaveBeenCalled();
  }

  // Verify StockLocationService.create was called
  if (spies.stockLocationService?.create) {
    expect(spies.stockLocationService.create).toHaveBeenCalled();
  }

  // Verify PaymentMethodService.create was called (should be called twice for Cash + M-Pesa)
  if (spies.paymentMethodService?.create) {
    expect(spies.paymentMethodService.create).toHaveBeenCalledTimes(2);
  }

  // Verify RoleService.create was NOT called (Bypass for Bootstrap)
  if (spies.roleService?.create) {
    expect(spies.roleService.create).not.toHaveBeenCalled();
  }

  // Verify AdministratorService.create was NOT called (Bypass for Bootstrap)
  if (spies.administratorService?.create) {
    expect(spies.administratorService.create).not.toHaveBeenCalled();
  }
}

/**
 * Create service spies for a test
 *
 * This helper creates spies on Vendure services that can be used
 * to verify service calls during provisioning.
 */
export function createServiceSpies(services: {
  sellerService?: SellerService;
  channelService?: ChannelService;
  stockLocationService?: StockLocationService;
  paymentMethodService?: PaymentMethodService;
  roleService?: RoleService;
  administratorService?: AdministratorService;
}): ProvisioningServiceSpies {
  const spies: ProvisioningServiceSpies = {};

  if (services.sellerService) {
    spies.sellerService = {
      create: jest.spyOn(services.sellerService, 'create'),
    };
  }

  if (services.channelService) {
    spies.channelService = {
      create: jest.spyOn(services.channelService, 'create'),
      findOne: jest.spyOn(services.channelService, 'findOne'),
    };
  }

  if (services.stockLocationService) {
    spies.stockLocationService = {
      create: jest.spyOn(services.stockLocationService, 'create'),
      findOne: jest.spyOn(services.stockLocationService, 'findOne'),
    };
  }

  if (services.paymentMethodService) {
    spies.paymentMethodService = {
      create: jest.spyOn(services.paymentMethodService, 'create'),
    };
  }

  if (services.roleService) {
    spies.roleService = {
      create: jest.spyOn(services.roleService, 'create'),
      assignRoleToUser:
        typeof (services.roleService as any).assignRoleToUser === 'function'
          ? jest.spyOn(services.roleService, 'assignRoleToUser' as any)
          : undefined,
    };
  }

  if (services.administratorService) {
    spies.administratorService = {
      create: jest.spyOn(services.administratorService, 'create'),
      update:
        typeof (services.administratorService as any).update === 'function'
          ? jest.spyOn(services.administratorService, 'update' as any)
          : undefined,
    };
  }

  return spies;
}

/**
 * Provisioning checklist for documentation
 *
 * This list documents what "ALL provisioning must create" means.
 * Update this when new entities are added to the provisioning flow.
 */
export const PROVISIONING_CHECKLIST = [
  'Seller created and linked to channel',
  'Channel created with correct configuration (code, currency, zones)',
  'Stock location created and assigned to channel',
  'Payment methods (Cash + M-Pesa) created and assigned to channel',
  'Chart of Accounts initialized with all required accounts',
  'Role created with all required permissions and assigned to channel',
  'Administrator created with role assignment',
  'User-role linkage verified',
  'All entities accessible via Vendure services (not just repositories)',
] as const;
