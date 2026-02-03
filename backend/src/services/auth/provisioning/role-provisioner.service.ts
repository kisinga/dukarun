import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  EventBus,
  ID,
  Permission,
  RequestContext,
  Role,
  RoleEvent,
  TransactionalConnection,
} from '@vendure/core';
import { ProvisioningContextAdapter } from '../../provisioning/context-adapter.service';
import { RegistrationInput } from '../registration.service';
import { RegistrationAuditorService } from './registration-auditor.service';
import { RegistrationErrorService } from './registration-error.service';

// Import custom permission definitions
import { OverridePricePermission } from '../../../plugins/pricing/price-override.permission';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
} from '../../../plugins/credit/permissions';
import { ManageStockAdjustmentsPermission } from '../../../plugins/stock/permissions';
import {
  ManageReconciliationPermission,
  CloseAccountingPeriodPermission,
} from '../../../plugins/ledger/permissions';
import { ManageSupplierCreditPurchasesPermission } from '../../../plugins/credit/supplier-credit.permissions';

/**
 * Role Template Definitions
 *
 * Predefined role templates for common admin roles with specific permission sets.
 * Templates are code constants, not stored in database.
 */
export interface RoleTemplate {
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  admin: {
    code: 'admin',
    name: 'Admin',
    description: 'Full system access',
    permissions: [
      // Asset permissions
      Permission.CreateAsset,
      Permission.ReadAsset,
      Permission.UpdateAsset,
      Permission.DeleteAsset,
      // Catalog permissions
      Permission.CreateCatalog,
      Permission.ReadCatalog,
      Permission.UpdateCatalog,
      Permission.DeleteCatalog,
      // Customer permissions
      Permission.CreateCustomer,
      Permission.ReadCustomer,
      Permission.UpdateCustomer,
      Permission.DeleteCustomer,
      // Order permissions
      Permission.CreateOrder,
      Permission.ReadOrder,
      Permission.UpdateOrder,
      Permission.DeleteOrder,
      // Product permissions
      Permission.CreateProduct,
      Permission.ReadProduct,
      Permission.UpdateProduct,
      Permission.DeleteProduct,
      // StockLocation permissions
      Permission.CreateStockLocation,
      Permission.ReadStockLocation,
      Permission.UpdateStockLocation,
      // Channel permissions (required for asset access)
      Permission.ReadChannel,
      // Settings permissions
      Permission.ReadSettings,
      Permission.UpdateSettings,
      // Administrator permissions (channel-scoped)
      Permission.CreateAdministrator,
      Permission.UpdateAdministrator,
      // Custom permissions
      OverridePricePermission.Permission as Permission,
      ApproveCustomerCreditPermission.Permission as Permission,
      ManageCustomerCreditLimitPermission.Permission as Permission,
      ManageStockAdjustmentsPermission.Permission as Permission,
      ManageReconciliationPermission.Permission as Permission,
      CloseAccountingPeriodPermission.Permission as Permission,
      ManageSupplierCreditPurchasesPermission.Permission as Permission,
    ],
  },
  cashier: {
    code: 'cashier',
    name: 'Cashier',
    description: 'Payment processing and credit approval',
    permissions: [
      Permission.ReadAsset, // Required for ML model access and product images
      Permission.ReadChannel, // Required for asset access via AssetServerPlugin
      Permission.ReadOrder,
      Permission.UpdateOrder,
      Permission.ReadCustomer,
      Permission.ReadProduct,
      ApproveCustomerCreditPermission.Permission as Permission,
      ManageReconciliationPermission.Permission as Permission,
    ],
  },
  accountant: {
    code: 'accountant',
    name: 'Accountant',
    description: 'Financial oversight and reconciliation',
    permissions: [
      Permission.ReadAsset, // Required for ML model access and product images
      Permission.ReadChannel, // Required for asset access via AssetServerPlugin
      Permission.ReadOrder,
      Permission.ReadCustomer,
      Permission.ReadProduct,
      ManageReconciliationPermission.Permission as Permission,
      CloseAccountingPeriodPermission.Permission as Permission,
      ManageCustomerCreditLimitPermission.Permission as Permission,
      ManageSupplierCreditPurchasesPermission.Permission as Permission,
    ],
  },
  salesperson: {
    code: 'salesperson',
    name: 'Salesperson',
    description: 'Sales operations and customer management',
    permissions: [
      Permission.ReadAsset, // Required for ML model access and product images
      Permission.ReadChannel, // Required for asset access via AssetServerPlugin
      Permission.CreateOrder,
      Permission.ReadOrder,
      Permission.CreateCustomer,
      Permission.ReadCustomer,
      Permission.ReadProduct,
      OverridePricePermission.Permission as Permission,
    ],
  },
  stockkeeper: {
    code: 'stockkeeper',
    name: 'Stockkeeper',
    description: 'Inventory management',
    permissions: [
      Permission.ReadAsset, // Required for product images
      Permission.ReadChannel, // Required for asset access via AssetServerPlugin
      Permission.CreateAsset, // Required for uploading product images
      Permission.CreateProduct,
      Permission.ReadProduct,
      Permission.UpdateProduct,
      Permission.ReadStockLocation,
      ManageStockAdjustmentsPermission.Permission as Permission,
    ],
  },
};

/**
 * Role Provisioner Service
 *
 * Handles admin role creation with full permissions and channel assignment.
 * LOB: Role = Access control and permissions for channel admins.
 */
@Injectable()
export class RoleProvisionerService {
  private readonly logger = new Logger(RoleProvisionerService.name);

  /**
   * All required admin permissions as per CUSTOMER_PROVISIONING.md Step 5
   * Factored into constant for maintainability
   */
  private static readonly ALL_ADMIN_PERMISSIONS: Permission[] = [
    // Asset permissions
    Permission.CreateAsset,
    Permission.ReadAsset,
    Permission.UpdateAsset,
    Permission.DeleteAsset,
    // Catalog permissions
    Permission.CreateCatalog,
    Permission.ReadCatalog,
    Permission.UpdateCatalog,
    Permission.DeleteCatalog,
    // Customer permissions
    Permission.CreateCustomer,
    Permission.ReadCustomer,
    Permission.UpdateCustomer,
    Permission.DeleteCustomer,
    // Order permissions (covers payments and fulfillments)
    Permission.CreateOrder,
    Permission.ReadOrder,
    Permission.UpdateOrder,
    Permission.DeleteOrder,
    // Product permissions (covers products and variants)
    Permission.CreateProduct,
    Permission.ReadProduct,
    Permission.UpdateProduct,
    Permission.DeleteProduct,
    // StockLocation permissions
    Permission.CreateStockLocation,
    Permission.ReadStockLocation,
    Permission.UpdateStockLocation,
    // Channel permissions (required for asset access)
    Permission.ReadChannel,
    // Settings permissions
    Permission.ReadSettings,
    Permission.UpdateSettings,
    // Administrator permissions (channel-scoped)
    Permission.CreateAdministrator,
    Permission.UpdateAdministrator,
    // Custom permissions for channel admin
    OverridePricePermission.Permission as Permission,
    ApproveCustomerCreditPermission.Permission as Permission,
    ManageCustomerCreditLimitPermission.Permission as Permission,
    ManageStockAdjustmentsPermission.Permission as Permission,
    ManageReconciliationPermission.Permission as Permission,
    CloseAccountingPeriodPermission.Permission as Permission,
    ManageSupplierCreditPurchasesPermission.Permission as Permission,
  ];

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus,
    private readonly auditor: RegistrationAuditorService,
    private readonly errorService: RegistrationErrorService,
    private readonly contextAdapter: ProvisioningContextAdapter
  ) {}

  /**
   * Create admin role with all required permissions and assign to channel
   *
   * **Provisioning Bootstrap Strategy:**
   * Uses direct Repository access to bypass RoleService permission checks.
   * This is necessary because RoleService.create() enforces permissions that the
   * SuperAdmin may not consistently have visibility of for a brand-new channel
   * in the same transaction due to cache/IdentityMap latency.
   *
   * We treat this as a system-level provisioning operation where we manually
   * construct the entity and publish the event.
   */
  async createAdminRole(
    ctx: RequestContext,
    registrationData: RegistrationInput,
    channelId: ID,
    companyCode: string // Company code from channel.code
  ): Promise<Role> {
    try {
      const roleCode = `${companyCode}-admin`;

      // Load the new channel for assignment
      const channel = await this.connection.getRepository(ctx, Channel).findOne({
        where: { id: channelId },
      });

      if (!channel) {
        throw this.errorService.createError('ROLE_CREATE_FAILED', `Channel ${channelId} not found`);
      }

      // Manually construct Role entity (Repository Bootstrap)
      // Role is scoped to only the new channel - maintains channel isolation
      const role = new Role({
        code: roleCode,
        description: `Full admin access for ${registrationData.companyName}`,
        permissions: RoleProvisionerService.ALL_ADMIN_PERMISSIONS,
        channels: [channel],
      });

      // Save directly to repository
      const savedRole = await this.connection.getRepository(ctx, Role).save(role);

      // Publish event to ensure system consistency
      await this.eventBus.publish(
        new RoleEvent(ctx, savedRole, 'created', {
          code: roleCode,
          description: role.description,
          permissions: role.permissions,
          channelIds: [channelId],
        })
      );

      this.logger.log(
        `Role created via Repository Bootstrap: ${savedRole.id} Code: ${savedRole.code}`
      );

      // Verify role-channel linkage
      await this.verifyRoleChannelLinkage(ctx, savedRole.id, channelId);

      // Audit log
      await this.auditor.logEntityCreated(ctx, 'Role', savedRole.id.toString(), savedRole, {
        channelId: channelId.toString(),
        companyCode: companyCode,
        companyName: registrationData.companyName,
      });

      return savedRole;
    } catch (error: any) {
      this.errorService.logError('RoleProvisioner', error, 'Role creation');
      throw this.errorService.wrapError(error, 'ROLE_CREATE_FAILED');
    }
  }

  /**
   * Get all admin permissions
   */
  getAdminPermissions(): Permission[] {
    return [...RoleProvisionerService.ALL_ADMIN_PERMISSIONS];
  }

  /**
   * Get role template by code
   */
  getRoleTemplate(code: string): RoleTemplate | undefined {
    return ROLE_TEMPLATES[code];
  }

  /**
   * Get all role templates
   */
  getAllRoleTemplates(): RoleTemplate[] {
    return Object.values(ROLE_TEMPLATES);
  }

  /**
   * Verify role is properly linked to channel
   * Uses repository to load role with relations (RoleService limitation - no relations parameter support)
   */
  private async verifyRoleChannelLinkage(
    ctx: RequestContext,
    roleId: ID,
    channelId: ID
  ): Promise<void> {
    // Note: RoleService doesn't support loading with relations parameter,
    // so we use repository for verification (documented limitation)
    const roleRepo = this.connection.getRepository(ctx, Role);
    const verifiedRole = await roleRepo.findOne({
      where: { id: roleId },
      relations: ['channels'],
    });

    if (!verifiedRole) {
      throw this.errorService.createError(
        'ROLE_ASSIGN_FAILED',
        'Failed to load role for verification'
      );
    }

    if (!verifiedRole.channels || !verifiedRole.channels.some(ch => ch.id === channelId)) {
      throw this.errorService.createError(
        'ROLE_ASSIGN_FAILED',
        `Role ${roleId} is not properly linked to channel ${channelId}`
      );
    }
  }
}
